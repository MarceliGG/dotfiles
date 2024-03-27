echo "source=~/.config/hypr/hyprland_themes/rounded2.conf" > $HOME/.config/hypr/hyprland_themes/selected.conf
echo "{\"include\": [\"~/.config/waybar/way11/config\"]}" > $HOME/.config/waybar/theme
echo "@import url(\"./way11/style.css\");" > $HOME/.config/waybar/style.css

killall waybar
waybar & disown
killall mako
mako -c ~/.config/mako/square-bottom & disown
