#!/bin/python

import json
import subprocess

windows = json.loads(subprocess.check_output(["hyprctl", "clients", "-j"]))

print(json.dumps([{
        "label": w["title"],
        "exec": f"hyprctl dispatch focuswindow pid:{w["pid"]}",
        "icon": w["class"],
        "sub": w["class"],
    } for w in windows] or [{
        "label": "No windows..."
    }]))
