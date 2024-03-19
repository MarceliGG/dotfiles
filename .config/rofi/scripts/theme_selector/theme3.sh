echo "source=~/.config/hypr/hyprland_themes/rounded.conf" > $HOME/.config/hypr/hyprland_themes/selected.conf
echo "{\"include\": [\"~/.config/waybar/segmentet-top/config\"]}" > $HOME/.config/waybar/theme
echo "@import url(\"./segmentet-top/style.css\");" > $HOME/.config/waybar/style.css
echo "@import \"~/.config/rofi/hypr.rasi\"" > $HOME/.config/rofi/config.rasi

killall waybar
waybar & disown
killall mako
mako -c ~/.config/mako/rounded-top & disown
