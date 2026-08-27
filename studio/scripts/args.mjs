import path from "node:path";

export function resolveVault(argv = process.argv.slice(2)) {
  const flagIndex = argv.findIndex((arg) => arg === "--vault");
  const fromFlag = flagIndex >= 0 ? argv[flagIndex + 1] : undefined;
  const candidate = fromFlag || process.env.THE_WAY_HERE_VAULT || "..";
  return path.resolve(process.cwd(), candidate);
}

export function resolveKnowledgeBase(argv = process.argv.slice(2)) {
  const flagIndex = argv.findIndex((arg) => arg === "--knowledge-base");
  return (flagIndex >= 0 ? argv[flagIndex + 1] : process.env.THE_WAY_HERE_KNOWLEDGE_BASE) || undefined;
}

export function resolvePort(defaultPort = 4321, argv = process.argv.slice(2)) {
  const flagIndex = argv.findIndex((arg) => arg === "--port");
  const raw = flagIndex >= 0 ? argv[flagIndex + 1] : process.env.THE_WAY_HERE_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : defaultPort;
  return Number.isFinite(parsed) ? parsed : defaultPort;
}
