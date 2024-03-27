echo "source=~/.config/hypr/hyprland_themes/square.conf" > $HOME/.config/hypr/hyprland_themes/selected.conf
echo "{\"include\": [\"~/.config/waybar/top/config\"]}" > $HOME/.config/waybar/theme
echo "@import url(\"./top/style.css\");" > $HOME/.config/waybar/style.css

killall waybar
waybar & disown
killall mako
mako -c ~/.config/mako/square-top & disown
