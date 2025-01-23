#!/bin/sh
pkill compiled
d=`pwd`
./build.sh && cd && $d/compiled.js &
