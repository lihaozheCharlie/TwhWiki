#!/usr/bin/env bash

set -Eeuo pipefail

WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "$WORKSPACE_DIR/studio/start.sh" --vault "$WORKSPACE_DIR" "$@"
