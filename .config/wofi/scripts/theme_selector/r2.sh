echo "source=~/.config/hypr/hyprland_themes/rounded.conf" > $HOME/.config/hypr/hyprland_themes/selected.conf
echo "{\"include\": [\"~/.config/waybar/modules-bot/config\"]}" > $HOME/.config/waybar/theme
echo "@import url(\"./modules-bot/style.css\");" > $HOME/.config/waybar/style.css

killall waybar
waybar & disown
killall mako
mako -c ~/.config/mako/rounded-top & disown
