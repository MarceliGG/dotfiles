#!/bin/sh

wid="$(hyprctl activeworkspace -j | jq .id)"
name="$1"
[ -z "$name" ] && name="$wid"
hyprctl dispatch renameworkspace "$wid" "$name"
hyprctl reload
