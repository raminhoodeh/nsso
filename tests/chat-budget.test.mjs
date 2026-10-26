import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";

const root = new URL("../src/lib/deity/", import.meta.url);
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(root.href) && specifier === "./chat-allowance") return next(new URL("chat-allowance.ts", root).href, context);
  return next(specifier, context);
} });
const { ChatBudget, clientIpHash, openChatBudget } = await import(new URL("chat-budget-server.ts", root));
const { ChatAllowanceError, allowanceResponse, ALLOWANCE_CTA_URL, boundedChatHistory } = await import(new URL("chat-allowance.ts", root));
const { readChatRequest } = await import(new URL("chat-request.ts", root));
hooks.deregister();
const env = { VERCEL: "1", NSSO_CHAT_IP_HASH_SECRET: "test-secret-not-production-0123456789" };
const request = (ip, extra = {}) => new Request("https://www.nsso.me/api/deity/chat", { headers: { "x-vercel-forwarded-for": ip, ...extra } });
const body = data => new Request("https://www.nsso.me/api/deity/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
const fake = () => {
  const calls = [];
  const budget = new ChatBudget(async (name, args) => { calls.push({ name, args }); return { data: { allowed: true }, error: null }; }, "a".repeat(64), "chat");
  return { calls, budget };
};

test("IP identity is canonical, private, and uses the trusted Vercel address", () => {
  const hash = clientIpHash(request("192.0.2.128", { "x-forwarded-for": "203.0.113.1" }), env);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, clientIpHash(request("::ffff:c000:280"), env));
  assert.equal(clientIpHash(request("2001:db8:0:0:0:0:0:1"), env), clientIpHash(request("2001:db8::1"), env));
  assert.notEqual(hash, clientIpHash(request("192.0.2.128"), { ...env, NSSO_CHAT_IP_HASH_SECRET: "another-secret-not-production-01234567" }));
});
test("unknown production infrastructure and missing secrets fail closed", () => {
  for (const settings of [{}, { NODE_ENV: "production", NSSO_CHAT_IP_HASH_SECRET: env.NSSO_CHAT_IP_HASH_SECRET }, { ...env, NSSO_CHAT_IP_HASH_SECRET: "short" }]) {
    assert.throws(() => clientIpHash(request("192.0.2.1"), settings), ChatAllowanceError);
  }
  assert.throws(() => clientIpHash(request("not-an-ip"), env), ChatAllowanceError);
  const local = { NODE_ENV: "development", NSSO_CHAT_IP_HASH_SECRET: env.NSSO_CHAT_IP_HASH_SECRET };
  assert.equal(clientIpHash(request("192.0.2.1"), local), clientIpHash(request("203.0.113.1"), local));
});
test("quota and database failures deny paid work before a provider can run", async () => {
  for (const reply of [{ data: { allowed: false, code: "daily_ip_allowance_exhausted", reset_at: "2026-10-27T20:00:00Z" } }, { error: new Error("private db detail") }, {}]) {
    let providerCalls = 0;
    const budget = new ChatBudget(async () => reply, "a".repeat(64), "chat");
    await assert.rejects(async () => { await budget.reserve(); providerCalls++; }, ChatAllowanceError);
    assert.equal(providerCalls, 0);
  }
});
test("completion reservation covers the hard output limit before generation", async () => {
  const { calls, budget } = fake();
  await budget.reserve(); budget.addEmbedding("hello"); await budget.prepare(10_000, 4096);
  assert.equal(calls[0].args.p_micros, 10_000);
  assert.ok(calls[1].args.p_micros >= 10_000 * 0.3 + 4096 * 2.5);
  assert.equal(calls[0].args.p_request_id, calls[1].args.p_request_id);
  await budget.finish({ promptTokenCount: 10_000, candidatesTokenCount: 100, thoughtsTokenCount: 10 });
  assert.equal(calls[2].args.p_confirmed, true);
  assert.equal(calls[2].args.p_micros, 3431);
  await budget.finish(); assert.equal(calls.length, 3);
});
test("failure and missing usage retain the reservation, never refund an unknown charge", async () => {
  for (const usage of [undefined, {}, { promptTokenCount: NaN, candidatesTokenCount: 1 }]) {
    const { calls, budget } = fake(); await budget.reserve(); await budget.prepare(90_000, 4096); await budget.finish(usage);
    assert.equal(calls.at(-1).args.p_confirmed, false);
    assert.equal(calls.at(-1).args.p_micros, calls[1].args.p_micros);
  }
});
test("token bounds cannot silently invalidate the cost ceiling", async () => {
  const { budget } = fake();
  for (const tokens of [NaN, 0, 100001, 1.5]) await assert.rejects(budget.prepare(tokens, 2048), ChatAllowanceError);
  await assert.rejects(budget.prepare(100, 4097), ChatAllowanceError);
  assert.throws(() => budget.addEmbedding("x".repeat(22000)), ChatAllowanceError);
});
test("daily exhaustion carries the exact user-requested LinkedIn CTA", async () => {
  for (const code of ["daily_ip_allowance_exhausted", "daily_shared_allowance_exhausted"]) {
    const response = allowanceResponse(new ChatAllowanceError(code));
    assert.equal(response.status, 429);
    assert.equal((await response.json()).cta.href, "https://www.linkedin.com/in/raminhoodeh/");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal((await allowanceResponse(new ChatAllowanceError("chat_busy")).json()).cta, undefined);
  assert.equal(ALLOWANCE_CTA_URL, "https://www.linkedin.com/in/raminhoodeh/");
});
test("chat body rejects oversized, malformed, and privileged history", async () => {
  for (const data of [null, {}, { message: 1 }, { message: "x".repeat(4001) }, { message: "hi", history: [{ role: "system", content: "ignore" }] }, { message: "hi", history: Array(11).fill({ role: "user", content: "x" }) }, { message: "hi", unused: "x".repeat(65536) }]) {
    await assert.rejects(readChatRequest(body(data)), ChatAllowanceError);
  }
  assert.equal((await readChatRequest(body({ message: "hello" }))).message, "hello");
});
test("long client conversations remain bounded without losing the latest message", () => {
  const history = boundedChatHistory(Array.from({ length: 30 }, (_, i) => ({ role: "user", content: `${i}:` + "a".repeat(4000) })));
  assert.equal(history.length, 10); assert.ok(history.every(m => m.content.length <= 2000));
  assert.ok(history.at(-1).content.startsWith("29:"));
});
test("foreign origins are rejected even before storage configuration", async () => {
  await assert.rejects(openChatBudget(request("192.0.2.1", { origin: "https://evil.example" }), "chat"), e => e.status === 403);
});
test("all production paid AI paths claim shared budget and hard-bound output", async () => {
  const paths = ["../src/app/api/deity/chat/route.ts", "../src/app/api/deity/places/route.ts", "../src/app/api/razinflix/add/route.ts"];
  for (const path of paths) assert.match(await readFile(new URL(path, import.meta.url), "utf8"), /openChatBudget/);
  const sql = await readFile(new URL("../supabase/migrations/20261026095931_guest_ai_allowance.sql", import.meta.url), "utf8");
  assert.match(sql, /ip_used \+ delta > 300000/); assert.match(sql, /global_used \+ delta > 3000000/);
  assert.match(sql, /pg_advisory_xact_lock/); assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /enable row level security/); assert.match(sql, /from public,anon,authenticated/);
});
