#!/bin/sh

bat=/sys/class/power_supply/BAT0/
per="$(cat "$bat/capacity")"

icon() {

charging=""

if [ $(cat "$bat/status") = Charging ]; then
  charging=""
fi

if [ "$per" -gt "80" ]; then
	icon=""
elif [ "$per" -gt "60" ]; then
	icon=""
elif [ "$per" -gt "40" ]; then
	icon=""
elif [ "$per" -gt "20" ]; then
	icon=""
elif [ "$per" -gt "0" ]; then
	icon=""
	notify-send -u critical "Battery Low" "Connect Charger"
else
        echo  && exit
fi
echo "$charging$icon"
}

percent() {
echo $per
}

[ "$1" = "i" ] && icon && exit
[ "$1" = "p" ] && percent && exit
exit
