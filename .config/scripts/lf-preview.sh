#!/bin/sh
mime_type=$(xdg-mime query filetype "$1")
echo -e "\u001b[32m"
echo "$1"
echo $mime_type
echo -e "\u001b[0m"
case $mime_type in
    image/svg*)awk "{printf \"\u001b[34m%02d\",NR}{print \"|\u001b[0m\"\$0} NR==$(($3-4)){exit}" "$1";;
    image/*)[ "$(ls -l "$1" | awk -F" " '{print $5}')" -le 10000000 ] && viu -w $2 -s "$1" || echo "Image over 10MB";;
    inode/x-empty)echo "[empty]";;
    *)awk "{printf \"\u001b[34m%02d\",NR}{print \"|\u001b[0m\"\$0} NR==$(($3-4)){exit}" "$1";;
esac
