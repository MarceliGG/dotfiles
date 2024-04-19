#!/bin/sh

chosen=$(echo -e "sleep\nlock\nlogout\nreboot\nshutdown" | wofi --dmenu --conf $HOME/.config/wofi/scripts/power_menu/wofi.conf ) && sh "$HOME/.config/wofi/scripts/power_menu/$chosen.sh"
