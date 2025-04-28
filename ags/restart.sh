#!/bin/sh
pkill compiled
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
./build.sh && cd && "$SCRIPT_DIR/compiled.js" &
