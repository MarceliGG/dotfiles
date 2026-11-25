import Quickshell.Wayland
import Quickshell

import QtQuick.Layouts
import QtQuick

import qs.services

PanelWindow {
    id: root

    visible: false
    color: "transparent"

    WlrLayershell.layer: WlrLayer.Overlay
    exclusionMode: ExclusionMode.Ignore
    mask: Region {}

    anchors {
        bottom: true
    }

    Connections {
        target: OsdState
        function onMakeVisible() {
            root.visible = true;
        }
    }

    implicitHeight: content.implicitHeight + 12
    implicitWidth: content.implicitWidth + 32

    Rectangle {
        id: bg
        y: OsdState.shown ? 0 : root.height

        Behavior on y {
            NumberAnimation {
                duration: 200
                easing.type: Easing.OutCubic
                onStopped: {
                    if (!OsdState.shown)
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
                text: Audio.getIcon() + " "
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
                Layout.preferredWidth: 45
                font.pixelSize: 18
                horizontalAlignment: Text.AlignRight
                color: "#ddd"
                text: `${Audio.volume}%`
            }
        }
    }
}
