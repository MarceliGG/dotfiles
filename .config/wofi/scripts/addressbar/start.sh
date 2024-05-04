#!/bin/sh

query=$(wofi --cache-file=/dev/null --dmenu --style ~/.config/wofi/scripts/addressbar/style.css --width 600 --height 100)

q=$(echo "$query" | tr " " "+")

case "$query" in
  "") ;;
  "git") xdg-open "http:github.com";;
  "hypr") xdg-open "http:wiki.hyprland.org";;
  "w "*) xdg-open "http:pl.wikipedia.org/w/index.php?search=${q#"w"}";;
  "a "*) xdg-open "http:wiki.archlinux.org/index.php?search=${q#"a"}";;
  *\ *) xdg-open "http:google.com/search?q=$q";;
  *.*) xdg-open "http:$query" ;;
  *) xdg-open "http:google.com/search?q=$q";;
esac
