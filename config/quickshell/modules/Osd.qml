import Quickshell.Wayland
import Quickshell.Io
import Quickshell

import qs.services

import QtQuick.Layouts
import QtQuick

PanelWindow {
    id: root
    visible: false
    color: "transparent"

    WlrLayershell.layer: WlrLayer.Overlay
    exclusionMode: ExclusionMode.Ignore
    mask: Region {}

    implicitHeight: content.implicitHeight + 12
    implicitWidth: content.implicitWidth + 24

    Rectangle {
        anchors {
            fill: parent
        }

        radius: 8
        color: "black"

        RowLayout {
            id: content
            anchors {
                fill: parent
                margins: 6
                leftMargin: 12
                rightMargin: 12
            }

            Text {
                id: icon
                font.family: "JetBrains Mono Nerd Font"
                font.pixelSize: 24
                color: "#ddd"
                text: Audio.getIcon()
            }

            Rectangle {
                id: progress
                property real value: Audio.volume / 100

                color: "#333"

                Layout.preferredWidth: 150
                Layout.preferredHeight: 20

                radius: 4

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
        onTriggered: root.visible = false
    }

    function show() {
        root.visible = true;
        hideTimer.restart();
    }

    IpcHandler {
        target: "osd"
        function volUp() {
            Audio.incUp();
            root.show()
        }
        function volDown() {
            Audio.incDown();
            root.show()
        }

        function toggleMute() {
            const mute = Audio.toggleMute();
            root.show()
        }
    }
}
