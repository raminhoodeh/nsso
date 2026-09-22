/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const agentSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/agent/NSSOAgent.tsx"),
  "utf8",
);
const interfaceSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/agent/AgentChatInterface.tsx"),
  "utf8",
);

test("the open Deity dialog always isolates itself from dashboard dimming state", () => {
  assert.doesNotMatch(agentSource, /useUI/);
  assert.doesNotMatch(agentSource, /isBackgroundDimmed/);
  assert.match(agentSource, /z-\[5990\] bg-black\/60/);
  assert.doesNotMatch(agentSource, /bg-black\/0/);
  assert.match(agentSource, /z-\[6000\]/);
});

test("the Deity glass panel uses the readable dashboard material on mobile", () => {
  assert.match(interfaceSource, /semanticTint="dark"/);
  assert.match(interfaceSource, /semanticTintOpacity=\{0\.38\}/);
  assert.match(interfaceSource, /max-md:!rounded-none/);
  assert.match(interfaceSource, /contentClassName="flex h-full min-h-0 flex-col"/);
  assert.match(
    interfaceSource,
    /pb-\[max\(1\.5rem,env\(safe-area-inset-bottom\)\)\]/,
  );
});

test("opening Deity locks and restores the document scroll position", () => {
  assert.match(agentSource, /body\.style\.position = 'fixed'/);
  assert.match(agentSource, /root\.style\.overflow = 'hidden'/);
  assert.match(agentSource, /Object\.assign\(body\.style, previousBodyStyles\)/);
  assert.match(agentSource, /Object\.assign\(root\.style, previousRootStyles\)/);
  assert.match(agentSource, /window\.scrollTo\(scrollX, scrollY\)/);
});
