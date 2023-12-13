#!/bin/sh

down=false
icon=""
if [ $(cat /sys/class/net/w*/operstate) = down ]
then
  if [ $(cat /sys/class/net/enp*/operstate) = down ]
  then
    icon=""
    down=true
  else
    icon=""
  fi
fi

net=$(nmcli | grep "połączono" | sed 's/\ połączono\ do\ /Połączono do /g' | cut -d ':' -f2)

echo "{-net-: -$net-, -icon-: -$icon-, -down-: $down}" | sed 's/-/"/g' | jq
