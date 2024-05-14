#!/bin/sh

chosen=$(echo -e "rounded\nsquare\ntheme3\nhypr11\nr2" | wofi --dmenu ) && sh "$HOME/.config/wofi/scripts/theme_selector/$chosen.sh" && notify-send "Hyprland Theme" "Selected $chosen theme" -t 2000 -i "/home/marcel/.local/share/icons/Wings-Dark-Icons/actions/24@2x/games-config-theme.svg"
