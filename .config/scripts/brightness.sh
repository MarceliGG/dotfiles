#!/bin/bash

display_time=1000

if [ $1 = "up" ]
then
  brightness=$(brightnessctl set 5%+ | awk '/Current/{ print $4 }' | tr -d '()')
elif [ $1 = "down" ]
then
  brightness=$(brightnessctl set 5%- | awk '/Current/{ print $4 }' | tr -d '()')
elif [ $1 = "set" ]
then
  brightnessctl set $2%
  brightness=$2%
fi

icon="$HOME/.icons/brightness.png"

notify-send -t $display_time -i $icon "Brightness" "$brightness"
