import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const moduleUrl = source => `data:text/javascript,${encodeURIComponent(source)}`;
const hooks = registerHooks({ resolve(specifier, context, next) {
    const mocks = {
        'next/server': 'export const NextResponse={json:(...args)=>Response.json(...args)};',
        '@google/generative-ai': 'export class GoogleGenerativeAI {}',
        '@/lib/deity/chat-budget-server': 'export const CHAT_MODEL="fixture"; export const openChatBudget=()=>{throw Error("Unexpected editorial call")};',
        '@/lib/server/permissions': `
            export const requirePermission=async()=>{};
            export const permissionErrorResponse=()=>null;
            export function createPrivilegedClient() {
                return { from() {
                    return {
                        select() { return { eq: async()=>({data:[],error:null}) }; },
                        insert(row) {
                            globalThis.__cancelledFilmWrites.push(row);
                            return { select() { return { single:async()=>({data:{id:1,...row},error:null}) }; } };
                        }
                    };
                } };
            }`,
        '@/lib/server/bounded-request': 'export const readBoundedJson=async()=>({title:"Fixture"});export const requestBodyErrorResponse=()=>null;',
        '@/lib/razinflix/enrichment': `export class FilmEnrichmentError extends Error{};export const buildSearchTitleVariants=()=>[];export const fallbackRazinflixCategory=()=>"Drama";export const matchingAliases=()=>new Set(["fixture"]);export const normalizeTitle=value=>value;export const verifyPosterUrl=async()=>{};export const resolveTrailer=async()=>({trailer:{key:"FIXTURE1234",source:"fixture",title:"Trailer"}});export const resolveTmdbFilmWithFallback=async()=>({title:"Fixture",year:"2026",directors:["Fixture Director"],overview:"A fixture film.",posterUrl:"https://images.test/poster.jpg",rating:"8.0/10",tmdbId:1});`,
    };
    return Object.hasOwn(mocks, specifier) ? { url: moduleUrl(mocks[specifier]), shortCircuit: true } : next(specifier, context);
} });
const { POST } = await import('../src/app/api/razinflix/add/route.ts');
hooks.deregister();

test('an interrupted film lookup cannot start a database mutation after cancellation', async () => {
    const previousKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    globalThis.__cancelledFilmWrites = [];
    try {
        const controller = new AbortController();
        controller.abort();
        const request = new Request('https://nsso.test/api/razinflix/add', { method: 'POST', body: '{}', signal: controller.signal });
        const response = await POST(request);
        assert.equal(response.status, 499);
        assert.deepEqual(globalThis.__cancelledFilmWrites, []);
        assert.match((await response.json()).error, /Nothing was saved/);

        const liveResponse = await POST(new Request('https://nsso.test/api/razinflix/add', { method: 'POST', body: '{}' }));
        assert.equal(liveResponse.status, 200);
        assert.equal(globalThis.__cancelledFilmWrites.length, 1);
    } finally {
        if (previousKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        else process.env.GOOGLE_GENERATIVE_AI_API_KEY = previousKey;
        delete globalThis.__cancelledFilmWrites;
    }
});
