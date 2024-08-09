file=$(ls ~/.config/scripts/welcome_shell/src | shuf -n 1)

sh "$HOME/.config/scripts/welcome_shell/src/$file"
