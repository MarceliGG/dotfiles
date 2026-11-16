import Quickshell.Hyprland
import Quickshell.Wayland
import Quickshell.Io
import Quickshell

import qs.services

import QtQuick.Layouts
import QtQuick

PanelWindow {
    id: root
    property bool shown: false

    visible: false
    color: "transparent"

    WlrLayershell.layer: WlrLayer.Overlay
    exclusionMode: ExclusionMode.Ignore
    mask: Region {}

    anchors {
        bottom: true
    }

    implicitHeight: content.implicitHeight + 12
    implicitWidth: content.implicitWidth + 32

    Rectangle {
        y: root.shown ? 0 : root.height

        Behavior on y {
            NumberAnimation {
                duration: 200
                easing.type: Easing.OutCubic
                onStopped: {
                    if (!root.shown)
                        root.visible = false;
                }
            }
        }
        color: "#141418"
        width: parent.width
        height: parent.height
        topLeftRadius: height / 2
        topRightRadius: topLeftRadius

        RowLayout {
            id: content
            anchors {
                fill: parent
                margins: 6
                leftMargin: 16
                rightMargin: 16
            }

            Text {
                id: icon
                font.family: "JetBrains Mono Nerd Font"
                font.pixelSize: 20
                color: "#ddd"
                text: Audio.getIcon()
            }

            Rectangle {
                id: progress
                property real value: Audio.volume / 100

                color: "#333"

                Layout.preferredWidth: 200
                Layout.preferredHeight: 15

                radius: height / 2

                Rectangle {
                    color: "#4698C0"
                    radius: progress.radius
                    width: parent.width * Math.max(0, Math.min(1, progress.value))
                    height: parent.height

                    Behavior on width {
                        NumberAnimation {
                            duration: 100
                        }
                    }
                }
            }

            Text {
                id: value
                font.family: "JetBrains Mono Nerd Font"
                font.pixelSize: 18
                color: "#ddd"
                text: `${Audio.volume}%`
            }
        }
    }

    Timer {
        id: hideTimer
        interval: 1000
        repeat: false
        running: false
        onTriggered: root.shown = false
    }

    function show() {
        visible = true;
        shown = true;
        hideTimer.restart();
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
