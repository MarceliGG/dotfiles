SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

file=$(ls "$SCRIPT_DIR/src" | shuf -n 1)
sh "$SCRIPT_DIR/src/$file"
