#!/bin/sh
cd "$1" && ags bundle app.js ../compiled.js && chmod +x ../compiled.js
