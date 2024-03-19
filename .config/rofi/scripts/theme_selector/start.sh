#!/bin/sh

chosen=$(echo "rounded\nsquare\ntheme3\nhypr11" | rofi -dmenu -config $HOME/.config/rofi/scripts/theme_selector/config.rasi) && sh "$HOME/.config/rofi/scripts/theme_selector/$chosen.sh" && notify-send "Hyprland Theme" "Selected $chosen theme" -t 2000 -i "/home/marcel/.local/share/icons/Wings-Dark-Icons/actions/24@2x/games-config-theme.svg"
