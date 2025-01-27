#!/bin/sh
pkill compiled
d=`pwd`
./build.sh "$1" && cd && $d/compiled.js &
