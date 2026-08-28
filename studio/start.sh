#!/usr/bin/env bash

set -Eeuo pipefail

STUDIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_VAULT="$(cd "$STUDIO_DIR/.." && pwd)"
LOCAL_NODE_DIR="$STUDIO_DIR/.runtime/node"
LOCAL_NODE="$LOCAL_NODE_DIR/bin/node"
LOCAL_PNPM_DIR="$STUDIO_DIR/.runtime/pnpm"
LOCAL_PNPM="$LOCAL_PNPM_DIR/node_modules/.bin/pnpm"
PYTHON_DEPS_DIR="$STUDIO_DIR/.runtime/python-packages"
VAULT_DIR="$DEFAULT_VAULT"
PORT="4321"
KNOWLEDGE_BASE=""

usage() {
  cat <<'EOF'
the-way-here

用法：
  ./start.sh [--vault <工作区路径>] [--knowledge-base <知识库 ID>] [--port <端口>]

参数：
  --vault <路径>  项目工作区路径；省略时使用 Studio 上一级工作区
  --knowledge-base <ID>  多知识库工作区中要打开的知识库；省略时优先个人库，否则使用 demo
  --port <端口>   本地端口，默认 4321
  -h, --help      显示帮助

脚本会检查运行环境、安装/校验依赖、构建产品，然后在前台启动服务。
按 Ctrl+C 即可停止，服务不会留在后台。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault)
      [[ $# -ge 2 ]] || { echo "错误：--vault 后需要提供路径。" >&2; exit 2; }
      VAULT_DIR="$2"
      shift 2
      ;;
    --port)
      [[ $# -ge 2 ]] || { echo "错误：--port 后需要提供端口。" >&2; exit 2; }
      PORT="$2"
      shift 2
      ;;
    --knowledge-base)
      [[ $# -ge 2 ]] || { echo "错误：--knowledge-base 后需要提供知识库 ID。" >&2; exit 2; }
      KNOWLEDGE_BASE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "错误：未知参数 $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$VAULT_DIR" != /* ]]; then
  VAULT_DIR="$STUDIO_DIR/$VAULT_DIR"
fi

if [[ ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "错误：端口必须是 1 到 65535 之间的数字。" >&2
  exit 2
fi

install_local_node() {
  local platform architecture archive checksum_file expected actual download_dir
  case "$(uname -s)" in
    Darwin) platform="darwin" ;;
    Linux) platform="linux" ;;
    *) echo "错误：当前系统不受自动安装 Node.js 支持：$(uname -s)。需要 Node.js 22.19 或更高版本。" >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) architecture="arm64" ;;
    x86_64|amd64) architecture="x64" ;;
    *) echo "错误：当前处理器不受自动安装 Node.js 支持：$(uname -m)。需要 Node.js 22.19 或更高版本。" >&2; exit 1 ;;
  esac
  command -v tar >/dev/null 2>&1 || { echo "错误：自动安装 Node.js 需要 tar。" >&2; exit 1; }
  download_dir="$(mktemp -d "${TMPDIR:-/tmp}/the-way-here-node.XXXXXX")"
  checksum_file="$download_dir/SHASUMS256.txt"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt" -o "$checksum_file"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt" -O "$checksum_file"
  else
    echo "错误：自动安装 Node.js 需要 curl 或 wget。" >&2
    exit 1
  fi
  archive="$(awk -v suffix="-${platform}-${architecture}.tar.gz" '$2 ~ suffix "$" { print $2; exit }' "$checksum_file")"
  [[ -n "$archive" ]] || { echo "错误：没有找到适用于 ${platform}-${architecture} 的 Node.js 22 安装包。" >&2; exit 1; }
  echo "首次启动：正在为本项目安装本地 Node.js 22…"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "https://nodejs.org/dist/latest-v22.x/$archive" -o "$download_dir/$archive"
  else
    wget -q "https://nodejs.org/dist/latest-v22.x/$archive" -O "$download_dir/$archive"
  fi
  expected="$(awk -v name="$archive" '$2 == name { print $1; exit }' "$checksum_file")"
  if command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$download_dir/$archive" | awk '{ print $1 }')"
  elif command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$download_dir/$archive" | awk '{ print $1 }')"
  else
    echo "错误：无法校验 Node.js 安装包；系统需要 shasum 或 sha256sum。" >&2
    exit 1
  fi
  [[ "$actual" == "$expected" ]] || { echo "错误：Node.js 安装包校验失败，未继续安装。" >&2; exit 1; }
  mkdir -p "$LOCAL_NODE_DIR"
  tar -xzf "$download_dir/$archive" -C "$LOCAL_NODE_DIR" --strip-components=1
  [[ -x "$LOCAL_NODE" ]] || { echo "错误：本地 Node.js 安装失败。" >&2; exit 1; }
}

if [[ -x "$LOCAL_NODE" ]]; then export PATH="$LOCAL_NODE_DIR/bin:$PATH"; hash -r; fi
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'const [major, minor] = process.versions.node.split(".").map(Number); major > 22 || (major === 22 && minor >= 19)' 2>/dev/null)" != "true" ]]; then
  install_local_node
  export PATH="$LOCAL_NODE_DIR/bin:$PATH"
  hash -r
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "错误：未找到 Python 3。Wiki 质量检查需要 Python 3。" >&2
  exit 1
fi

if [[ ! -d "$VAULT_DIR" ]]; then
  echo "错误：找不到工作区：$VAULT_DIR" >&2
  exit 1
fi

for required in the-way-here.config.yaml; do
  if [[ ! -e "$VAULT_DIR/$required" ]]; then
    echo "错误：工作区缺少 $required：$VAULT_DIR" >&2
    exit 1
  fi
done

if [[ -d "$VAULT_DIR/knowledge-engine" ]]; then
  export PYTHONPATH="$PYTHON_DEPS_DIR${PYTHONPATH:+:$PYTHONPATH}"
  if ! python3 -c 'import yaml' >/dev/null 2>&1; then
    REQUIREMENTS_FILE="$VAULT_DIR/knowledge-engine/requirements.txt"
    [[ -f "$REQUIREMENTS_FILE" ]] || { echo "错误：知识工具缺少依赖清单：$REQUIREMENTS_FILE" >&2; exit 1; }
    if ! python3 -m pip --version >/dev/null 2>&1; then
      echo "首次启动：正在启用 Python 包安装工具…"
      python3 -m ensurepip --user >/dev/null 2>&1 || { echo "错误：Python 3 缺少 pip，且无法自动启用。" >&2; exit 1; }
    fi
    echo "首次启动：正在为本项目安装 Python 依赖…"
    mkdir -p "$PYTHON_DEPS_DIR"
    python3 -m pip install --disable-pip-version-check --upgrade --target "$PYTHON_DEPS_DIR" -r "$REQUIREMENTS_FILE"
    python3 -c 'import yaml' >/dev/null 2>&1 || { echo "错误：Python 依赖安装后仍无法加载。" >&2; exit 1; }
  fi
fi

if [[ -x "$LOCAL_PNPM" ]]; then
  PNPM=("$LOCAL_PNPM")
elif command -v pnpm >/dev/null 2>&1 && [[ "$(pnpm --version 2>/dev/null)" == "11.19.0" ]]; then
  PNPM=(pnpm)
elif command -v npm >/dev/null 2>&1; then
  echo "首次启动：正在为本项目安装本地 pnpm 11.19.0…"
  mkdir -p "$LOCAL_PNPM_DIR"
  npm install \
    --prefix "$LOCAL_PNPM_DIR" \
    --no-save \
    --no-package-lock \
    --ignore-scripts \
    --loglevel=error \
    pnpm@11.19.0
  [[ -x "$LOCAL_PNPM" ]] || { echo "错误：本地 pnpm 安装失败。" >&2; exit 1; }
  PNPM=("$LOCAL_PNPM")
else
  echo "错误：未找到 pnpm、Corepack 或 npm，无法安装项目依赖。" >&2
  exit 1
fi

if [[ "${PNPM[0]}" == "$LOCAL_PNPM" ]]; then
  export PATH="$(dirname "$LOCAL_PNPM"):$PATH"
fi

echo ""
echo "the-way-here"
echo "  工作区: $VAULT_DIR"
if [[ -n "$KNOWLEDGE_BASE" ]]; then echo "  知识库: $KNOWLEDGE_BASE"; fi
echo "  地址:  http://127.0.0.1:$PORT"
echo ""
echo "[1/4] 检查环境"
echo "  Node.js $(node --version)"
echo "  Python  $(python3 --version 2>&1)"
if command -v codex >/dev/null 2>&1; then
  echo "  Codex   $(codex --version 2>&1)"
else
  echo "  Codex   未安装；阅读与编辑可用，AI 工作台暂不可用"
fi

cd "$STUDIO_DIR"

echo "[2/4] 检查并安装项目依赖"
"${PNPM[@]}" install --frozen-lockfile

echo "[3/4] 构建本地服务"
"${PNPM[@]}" --filter @the-way-here/web exec tsc --noEmit
"${PNPM[@]}" --filter @the-way-here/web exec vite build
"${PNPM[@]}" --filter @the-way-here/server build

echo "[4/4] 启动完成"
echo "按 Ctrl+C 停止 the-way-here。"
echo ""

START_ARGS=(--vault "$VAULT_DIR" --port "$PORT")
if [[ -n "$KNOWLEDGE_BASE" ]]; then START_ARGS+=(--knowledge-base "$KNOWLEDGE_BASE"); fi
exec node "$STUDIO_DIR/scripts/start.mjs" "${START_ARGS[@]}"
