#!/bin/zsh
set -euo pipefail

PORT="${PORT:-4300}"
# macOS shells often export HOST with the machine hostname, which breaks the
# container listener by binding Node to a non-container interface. Use a
# dedicated override knob and otherwise force 0.0.0.0 for Docker.
HOST="${APP_HOST:-0.0.0.0}"
LAN_IFACE="${LAN_IFACE:-$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}')}"

detect_ip() {
  local iface="$1"
  if [[ -z "$iface" ]]; then
    return 1
  fi

  ifconfig "$iface" 2>/dev/null | awk '/inet /{print $2; exit}'
}

LAN_IP="${APP_LAN_IP:-}"
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(detect_ip "$LAN_IFACE")"
fi
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(detect_ip en0)"
fi
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(ifconfig 2>/dev/null | awk '
    $1 ~ /^[a-z]/ { iface=$1 }
    /status: active/ { active[iface]=1 }
    /inet / && $2 != "127.0.0.1" && active[iface] { print $2; exit }
  ')"
fi

if [[ -z "$LAN_IP" ]]; then
  echo "Could not detect an active LAN IPv4 address." >&2
  echo "Set APP_LAN_IP manually, for example:" >&2
  echo "  APP_LAN_IP=192.168.1.223 npm run docker:local" >&2
  exit 1
fi

APP_PUBLIC_ORIGIN="${APP_PUBLIC_ORIGIN:-http://${LAN_IP}:${PORT}}"
APP_HTTPS_KEY_PATH="${APP_HTTPS_KEY_PATH:-}"
APP_HTTPS_CERT_PATH="${APP_HTTPS_CERT_PATH:-}"
COOKIE_SECURE="${COOKIE_SECURE:-}"
VIKUNJA_DEFAULT_BASE_URL="${VIKUNJA_DEFAULT_BASE_URL:-}"

echo "Starting local Docker instance"
echo "  Interface: ${LAN_IFACE:-auto}"
echo "  LAN IP: ${LAN_IP}"
echo "  Local URL: http://127.0.0.1:${PORT}"
echo "  LAN URL: ${APP_PUBLIC_ORIGIN}"
if [[ -n "${VIKUNJA_DEFAULT_BASE_URL:-}" ]]; then
  echo "  Default Vikunja URL: ${VIKUNJA_DEFAULT_BASE_URL}"
fi

export HOST
export PORT
export APP_PUBLIC_ORIGIN
export APP_HTTPS_KEY_PATH
export APP_HTTPS_CERT_PATH
export COOKIE_SECURE
export VIKUNJA_DEFAULT_BASE_URL

docker compose up --build -d

docker compose ps
curl -s "http://127.0.0.1:${PORT}/health" || true
