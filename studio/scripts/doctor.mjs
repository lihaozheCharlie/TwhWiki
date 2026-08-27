import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import YAML from "yaml";
import { resolveKnowledgeBase, resolveVault } from "./args.mjs";

const vault = resolveVault();
const knowledgeBase = resolveKnowledgeBase();
const checks = [];
let configuredAgents = {};

async function fileCheck(label, target, mode = constants.R_OK) {
  try {
    await access(target, mode);
    checks.push({ label, ok: true, detail: target });
  } catch {
    checks.push({ label, ok: false, detail: target });
  }
}

await fileCheck("工作区可读取", vault);
await fileCheck("工作区可写入", vault, constants.W_OK);
await fileCheck("工作区配置", path.join(vault, "the-way-here.config.yaml"));
try {
  const config = YAML.parse(await readFile(path.join(vault, "the-way-here.config.yaml"), "utf8")) || {};
  configuredAgents = config.agents || { runtimes: { codex: config.codex } };
  const selectedId = knowledgeBase || config.defaultKnowledgeBase || Object.keys(config.knowledgeBases || {})[0];
  const selected = config.knowledgeBases?.[selectedId] || {};
  const paths = { ...(config.paths || {}), ...(selected.paths || {}) };
  if (selectedId) {
    await fileCheck(`知识库 ${selectedId} Wiki`, path.resolve(vault, paths.wiki || "wiki"));
    await fileCheck(`知识库 ${selectedId} 来源`, path.resolve(vault, paths.sources || "sources"));
  }
} catch (error) {
  checks.push({ label: "工作区配置可解析", ok: false, detail: error instanceof Error ? error.message : String(error) });
}

for (const [label, command, args] of [
  ["Python", "python3", ["--version"]],
  ...(await access(path.join(vault, "knowledge-engine")).then(() => [["PyYAML", "python3", ["-c", "import yaml; print(yaml.__version__)"]]]).catch(() => [])),
]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  checks.push({
    label,
    ok: result.status === 0,
    detail: (result.stdout || result.stderr || "未找到").trim(),
  });
}

const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
checks.push({
  label: "Node.js",
  ok: nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 19),
  detail: `${process.version}（需要 22.19+）`,
});

const codex = spawnSync("codex", ["--version"], { encoding: "utf8" });
const codexEnabled = configuredAgents?.runtimes?.codex?.enabled !== false;
const piProviders = configuredAgents?.runtimes?.pi?.enabled === true ? configuredAgents.runtimes.pi.providers || [] : [];
checks.push({
  label: "Agent 运行时",
  ok: (codexEnabled && codex.status === 0) || piProviders.length > 0,
  detail: codexEnabled && codex.status === 0
    ? (codex.stdout || codex.stderr).trim()
    : piProviders.length > 0 ? `Pi 已配置 ${piProviders.length} 个模型服务` : "没有已启用的 Codex，且 Pi 尚未配置模型服务",
});

for (const check of checks) {
  console.log(`${check.ok ? "✓" : "✗"} ${check.label}: ${check.detail}`);
}

if (checks.some((check) => !check.ok)) process.exitCode = 1;
