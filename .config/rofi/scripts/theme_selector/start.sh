#!/bin/sh

chosen=$(echo -e "rounded\nsquare" | rofi -dmenu -config $HOME/.config/rofi/scripts/theme_selector/config.rasi)

sh "$HOME/.config/rofi/scripts/theme_selector/$chosen.sh"
