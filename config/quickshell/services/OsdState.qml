pragma Singleton

import Quickshell.Hyprland
import Quickshell

import QtQuick

import qs.services

Singleton {
    id: root
    property bool shown: false
    signal makeVisible()

    Timer {
        id: hideTimer
        interval: 1000
        repeat: false
        running: false
        onTriggered: root.shown = false
    }

    function show() {
        shown = true;
        hideTimer.restart();
        makeVisible();
    }

    GlobalShortcut {
        name: "volUp"
        description: "Increace system volume"
        onPressed: {
            Audio.incUp();
            root.show();
        }
    }

    GlobalShortcut {
        name: "volDown"
        description: "Decreace system volume"
        onPressed: {
            Audio.incDown();
            root.show();
        }
    }

    GlobalShortcut {
        name: "volMute"
        description: "Toggle system mute"
        onPressed: {
            Audio.toggleMute();
            root.show();
        }
    }
}
