#!/bin/bash

display_time=1000

if [ $1 = "up" ]
then
  brightness=$(brightnessctl set 5%+ | awk '/Current/{ print $4 }' | tr -d '()')
  notify-send -t $display_time "Brightness: $brightness%" 
elif [ $1 = "down" ]
then
  brightness=$(brightnessctl set 5%- | awk '/Current/{ print $4 }' | tr -d '()')
  notify-send -t $display_time "Brightness: $brightness%" 
elif [ $1 = "set" ]
then
  brightnessctl set $2%
  notify-send -t $display_time "Brightness: $2%"
fi
