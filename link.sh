#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

symlink_config() {
  if [ -e "$2" ] || [ -L "$2" ];then
    echo "File or directory '$2' exists."
    read -p "Do you want to delete it? [y/N]: " answer
    if [[ "$answer" == "y" || "$anwser" == "Y" ]];then
      rm -rf "$2"
    fi
  fi

  if [ -e "$2" ] || [ -L "$2" ];then
    echo "Skipping: '$1'"
  else
    ln -s "$1" "$2" && echo "Linked: '$1' as '$2'" 
  fi
}

for file in "$SCRIPT_DIR"/config/*; do
  f="$HOME/.config/$(basename "$file")"
  symlink_config "$file" "$f"
  echo
done

symlink_config "$SCRIPT_DIR/zshrc" "$HOME/.zshrc"
