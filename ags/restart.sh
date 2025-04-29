#!/bin/sh
pkill .shell
./build.sh && cd && "$HOME/.shell.js" &
