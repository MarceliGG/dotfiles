#!/bin/sh
col="$(hyprpicker)" # || exit

hex=${col#"#"}

r=$(printf "%d" "${hex:0:2}")
g=$(printf "%d" "${hex:2:2}")
b=$(printf "%d" "${hex:4:2}")

rgb="$r, $g, $b"

picked="$(echo -e "$col\n$hex\nrgb($rgb)\n$rgb" | $DMENU)" && wl-copy "$picked"
