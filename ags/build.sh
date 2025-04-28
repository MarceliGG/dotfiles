#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ags bundle "$SCRIPT_DIR/app.js" "$SCRIPT_DIR/compiled.js" && chmod +x "$SCRIPT_DIR/compiled.js"
