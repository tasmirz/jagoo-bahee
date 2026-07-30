#!/usr/bin/env bash
set -euo pipefail

BACKEND_PORT=3000
VIRTUAL_PORT=80
SERVICE_NAME="jagoo-bahee"
INSTALL_TOR=1

usage() {
  cat <<'EOF'
Usage: sudo bash ops/tor/setup-linux.sh [options]

Options:
  --backend-port PORT   Local Jagoo HTTP port (default: 3000)
  --virtual-port PORT   Onion service port shown to clients (default: 80)
  --service-name NAME   Tor hidden-service directory name (default: jagoo-bahee)
  --no-install          Require an existing tor binary
  --help                Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-port) BACKEND_PORT="$2"; shift 2 ;;
    --virtual-port) VIRTUAL_PORT="$2"; shift 2 ;;
    --service-name) SERVICE_NAME="$2"; shift 2 ;;
    --no-install) INSTALL_TOR=0; shift ;;
    --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$BACKEND_PORT" =~ ^[0-9]+$ ]] && (( BACKEND_PORT > 0 && BACKEND_PORT < 65536 )) ||
  { echo "Invalid backend port." >&2; exit 2; }
[[ "$VIRTUAL_PORT" =~ ^[0-9]+$ ]] && (( VIRTUAL_PORT > 0 && VIRTUAL_PORT < 65536 )) ||
  { echo "Invalid virtual port." >&2; exit 2; }
[[ "$SERVICE_NAME" =~ ^[a-zA-Z0-9_-]+$ ]] ||
  { echo "Service name may contain only letters, numbers, underscores, and hyphens." >&2; exit 2; }
(( EUID == 0 )) || { echo "Run this script as root (sudo)." >&2; exit 1; }

install_tor() {
  command -v tor >/dev/null 2>&1 && return
  (( INSTALL_TOR == 1 )) || { echo "tor is not installed." >&2; exit 1; }
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y tor
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y tor
  elif command -v pacman >/dev/null 2>&1; then
    pacman -S --noconfirm tor
  elif command -v zypper >/dev/null 2>&1; then
    zypper --non-interactive install tor
  else
    echo "No supported package manager found. Install Tor, then rerun with --no-install." >&2
    exit 1
  fi
}

install_tor

TORRC="/etc/tor/torrc"
DROPIN_DIR="/etc/tor/torrc.d"
DROPIN="$DROPIN_DIR/${SERVICE_NAME}.conf"
HIDDEN_SERVICE_DIR="/var/lib/tor/${SERVICE_NAME}"

[[ -f "$TORRC" ]] || { echo "Tor configuration not found at $TORRC." >&2; exit 1; }
install -d -m 0755 "$DROPIN_DIR"

if ! grep -Eq '^[[:space:]]*%include[[:space:]]+/etc/tor/torrc\.d/\*\.conf' "$TORRC"; then
  cp -a "$TORRC" "${TORRC}.jagoo-backup"
  printf '\n%%include /etc/tor/torrc.d/*.conf\n' >> "$TORRC"
fi

TMP_CONFIG="$(mktemp)"
trap 'rm -f "$TMP_CONFIG"' EXIT
cat > "$TMP_CONFIG" <<EOF
# Managed by Jagoo Bahee ops/tor/setup-linux.sh
HiddenServiceDir ${HIDDEN_SERVICE_DIR}
HiddenServiceVersion 3
HiddenServicePort ${VIRTUAL_PORT} 127.0.0.1:${BACKEND_PORT}
EOF
install -m 0644 "$TMP_CONFIG" "$DROPIN"

tor --verify-config -f "$TORRC"

if command -v systemctl >/dev/null 2>&1; then
  if systemctl list-unit-files tor.service --no-legend 2>/dev/null | grep -q tor.service; then
    systemctl enable --now tor.service
    systemctl restart tor.service
  elif systemctl list-unit-files tor@default.service --no-legend 2>/dev/null | grep -q tor@default.service; then
    systemctl enable --now tor@default.service
    systemctl restart tor@default.service
  else
    echo "Tor was configured, but no Tor systemd unit was found." >&2
    exit 1
  fi
elif command -v service >/dev/null 2>&1; then
  service tor restart
else
  echo "Tor was configured. Restart the Tor daemon manually." >&2
  exit 1
fi

HOSTNAME_FILE="${HIDDEN_SERVICE_DIR}/hostname"
for _ in {1..30}; do
  [[ -s "$HOSTNAME_FILE" ]] && break
  sleep 1
done
[[ -s "$HOSTNAME_FILE" ]] ||
  { echo "Tor started, but the onion hostname was not created. Check Tor logs." >&2; exit 1; }

ONION_HOST="$(tr -d '\r\n' < "$HOSTNAME_FILE")"
if (( VIRTUAL_PORT == 80 )); then
  ONION_URL="http://${ONION_HOST}"
else
  ONION_URL="http://${ONION_HOST}:${VIRTUAL_PORT}"
fi

echo "Jagoo Bahee onion service is ready:"
echo "$ONION_URL"
echo "It forwards only to 127.0.0.1:${BACKEND_PORT}."
echo "Back up ${HIDDEN_SERVICE_DIR} securely to preserve this onion address."
