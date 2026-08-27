import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const files = collectFiles(sourceRoot);
const css = files.filter((file) => extname(file) === ".css").map(read).join("\n");
const source = files.filter((file) => [".ts", ".tsx"].includes(extname(file))).map(read).join("\n");
const violations = [];

const pageLevelSelectors = [
  ".page-hero", ".workspace-page-head", ".layer-hero", ".knowledge-hero", ".focus-workspace-head",
  ".now-board", ".life-atlas", ".stage-focus-turns", ".life-map-note", ".model-definition",
  ".collection-detail-head", ".person-relationship-context", ".letter-date-context", ".advanced-safety",
  ".intent-selector button.active", ".session-steps li.current", ".route-sign", ".section-tabs",
  ".people-index", ".letter-index", ".model-index",
];
const warmFill = /background(?:-color)?\s*:[^;]*(?:var\(--(?:signal|accent-attention)\)|#ffd60a|#ffe77a|#f2c94c)/i;
const lifestyleDarkSelectors = [".life-atlas", ".growth-route", ".stage-focus", ".advanced-safety"];
const darkFill = /background(?:-color)?\s*:[^;]*(?:var\(--ink\)|#(?:151515|202020|22262d))/i;

for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = match[1].trim();
  const declarations = match[2];
  if (pageLevelSelectors.some((name) => selector.includes(name)) && warmFill.test(declarations)) violations.push(selector.replace(/\s+/g, " "));
  if (lifestyleDarkSelectors.some((name) => selector.includes(name)) && darkFill.test(declarations)) violations.push(selector.replace(/\s+/g, " "));
}

assert(!violations.length, "attention colors cannot fill page-level surfaces", violations);
assert(!/\beyebrow\s*=|\beyebrow\s*:/.test(source), "generic decorative eyebrow labels are not part of the page hierarchy");
assert(!/provenance-band|(?:01|02|03) · (?:所在阶段|同时出现|直接相连)/.test(source), "evidence relationships cannot be presented as a decorative process strip");
assert(!/local-navigation-inner[^}]*box-shadow\s*:(?!\s*none)/s.test(css), "secondary navigation cannot return to a floating card treatment");
assert(!/font-size\s*:\s*[89]px\b|font\s*:[^;{}]*\b[89]px\//.test(css), "visible interface metadata cannot fall below the 10px floor");
assert(/aria-current=/.test(source) && /addEventListener\("scroll"/.test(source), "the Markdown outline must expose and track the currently read section");
assert(/function EditableDocument/.test(source) && /setTimeout\(\(\) => void persist\(draft\), 800\)/.test(source), "Markdown editing must keep one shared autosave implementation");
assert(/shouldEnterDocumentEditMode/.test(source) && /onDoubleClick=\{requestEditing\}/.test(source) && !/onClick=\{scheduleEditing\}/.test(source), "shared Markdown editing must require a double click without hijacking text selection");
assert(/\.editable-document--preview[^}]*overflow:\s*visible/.test(css) && /\.source-pane-shell[^}]*position:\s*sticky/.test(css) && /\.document-outline[^}]*position:\s*sticky/.test(css), "Markdown pages must own the vertical scroll while both navigation sides stay sticky");
assert(/--source-workspace-min-height:\s*clamp\(/.test(css) && /\.source-preview[^}]*min-height:\s*var\(--source-workspace-min-height\)/.test(css) && /\.source-preview[^}]*min-height:\s*min\(620px/.test(css), "sparse source lists and documents must retain a useful working height across breakpoints");
assert(/\.collapsible-index-pane[^}]*height:\s*100%/.test(css) && /\.collection-detail[^}]*overflow:\s*visible/.test(css), "sticky Markdown navigation cannot be clipped or constrained by a short master-detail parent");
assert(/buildParallelStageRoute/.test(source) && /atlas-branch-network/.test(source) && /<path\b/.test(source), "parallel life stages must grow from the main route through a reusable curved path");
assert(/function CollapsibleIndexPane/.test(source) && [...source.matchAll(/<CollapsibleIndexPane\b/g)].length >= 4, "master-detail views must reuse the shared collapsible index");
assert(/function ContextualAgentDock/.test(source) && [...source.matchAll(/<ContextualAgentDock\b/g)].length >= 12, "contextual collaboration must reuse the shared dock");
assert(/\/api\/agent-settings/.test(source) && /"agent-settings"/.test(source) && /一处设置，所有 Agent 入口共用/.test(source), "Agent settings must persist through one global interface and refresh every entry");
assert(/\/api\/agent-provider-presets/.test(source) && /模型厂商/.test(source) && /模型与思考/.test(source) && /选择厂商即可使用官方服务地址/.test(source), "third-party Agent settings must use the shared vendor catalog without asking for an endpoint");

console.log(`Design contract passed across ${files.length} modular source files.`);

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(absolute) : [absolute];
  });
}

function read(file) {
  return readFileSync(file, "utf8");
}

function assert(condition, message, details = []) {
  if (condition) return;
  console.error(`Design contract failed: ${message}.`);
  for (const detail of details) console.error(`- ${detail}`);
  process.exit(1);
}
