#!/usr/bin/env sh
set -eu

log() {
  printf '[deploy-cleanup] %s\n' "$*"
}

APP_DIR="${1:-$(pwd)}"
cd "$APP_DIR"

log "Start cleanup in: $APP_DIR"
log "Disk before:"
df -h / || true

# Docker cleanup: remove only unused cache/artifacts.
if command -v docker >/dev/null 2>&1; then
  log "Docker found. Pruning unused build cache and artifacts."
  docker builder prune -af || true
  docker image prune -af || true
  docker container prune -f || true
  docker volume prune -f || true
else
  log "Docker not found. Skipping docker cleanup."
fi

# Optional system cleanup when sudo is non-interactive.
if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  log "Running lightweight system cache cleanup."
  sudo dnf clean all >/dev/null 2>&1 || true
  sudo rm -rf /var/cache/dnf/* || true
  sudo journalctl --vacuum-size=100M >/dev/null 2>&1 || true
fi

log "Disk after:"
df -h / || true
log "Cleanup done."
