#!/bin/sh

bat=/sys/class/power_supply/BAT0/
per="$(cat "$bat/capacity")"


charging="false"

if [ $(cat "$bat/status") = Charging ]; then
  charging="true"
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
else
        echo  && exit
fi

echo "{"\""icon"\"": "\""$icon"\"", "\""prec"\"": "\""$per"\"", "\""charging"\"": $charging}" | sed 's/-/"/g' | jq

exit
