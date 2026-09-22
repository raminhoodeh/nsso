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
const deityPageSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/deity/page.tsx"),
  "utf8",
);

test("the open Deity dialog always isolates itself from dashboard dimming state", () => {
  assert.doesNotMatch(agentSource, /useUI/);
  assert.doesNotMatch(agentSource, /isBackgroundDimmed/);
  assert.match(agentSource, /z-\[5990\] bg-black\/60/);
  assert.doesNotMatch(agentSource, /bg-black\/0/);
  assert.match(agentSource, /z-\[6000\][^\n]*bg-\[#11161d\]/);
  assert.match(
    agentSource,
    /opacity-100 translate-y-0 scale-100 pointer-events-auto/,
  );
});

test("the Deity interface is a calm opaque surface rather than nested glass", () => {
  assert.doesNotMatch(agentSource, /TahoeGlass(?:Surface|Button|Field)/);
  assert.doesNotMatch(interfaceSource, /TahoeGlass(?:Surface|Button|Field)/);
  assert.doesNotMatch(deityPageSource, /TahoeGlass(?:Surface|Button|Field)/);
  assert.doesNotMatch(interfaceSource, /backdrop-(?:blur|filter)/);
  assert.doesNotMatch(interfaceSource, /(?:Webkit)?backdropFilter/);
  assert.doesNotMatch(interfaceSource, /bg-transparent|bg-(?:black|white)\/\d+/);
  assert.doesNotMatch(interfaceSource, /semanticTint/);
  assert.match(interfaceSource, /data-deity-surface="opaque"/);
  assert.match(interfaceSource, /bg-\[#11161d\]/);
  assert.match(interfaceSource, /bg-\[#171d26\]/);
  assert.match(interfaceSource, /bg-\[#222a35\]/);
  assert.match(interfaceSource, /bg-\[#15313a\]/);
  assert.match(interfaceSource, /bg-\[#0c1118\]/);
  assert.match(interfaceSource, /max-md:!rounded-none/);
  assert.match(
    interfaceSource,
    /\[isCategoriesExpanded, setIsCategoriesExpanded\] = useState\(false\)/,
  );
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
