import Quickshell.Services.Notifications
import Quickshell.Widgets
import Quickshell

import QtQuick.Layouts
import QtQuick

Rectangle {
    id: root
    color: "#141418"

    required property Notification modelData

    width: ListView.view.width - 4
    implicitHeight: content.implicitHeight + 12

    border {
        width: 2
        color: {
            switch (root.modelData?.urgency) {
            case NotificationUrgency.Critical:
                return "#993344";
            case NotificationUrgency.Low:
                return "#444";
            default:
                return "#4698C0";
            }
        }
    }

    radius: 8

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.RightButton
        onClicked: m => root.modelData.dismiss()
    }

    ColumnLayout {
        id: content

        anchors {
            fill: parent
            margins: 6
        }

        spacing: root.modelData?.actions.length > 0 ? 4 : 0

        RowLayout {
            Layout.fillWidth: true

            IconImage {
                id: nImage
                implicitSize: 48
                source: root.modelData?.image || Quickshell.iconPath(root.modelData?.appIcon || "dialog-information")
            }

            ColumnLayout {
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignTop
                spacing: 0

                Text {
                    Layout.fillWidth: true
                    wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                    font.family: "JetBrains Mono Nerd Font"
                    font.pixelSize: 18
                    font.bold: true
                    color: "#ddd"
                    text: root.modelData?.summary || "No title"
                }

                Text {
                    Layout.fillWidth: true
                    wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                    font.family: "JetBrains Mono Nerd Font"
                    font.pixelSize: 14
                    color: "#ddd"
                    text: root.modelData?.body || "No body"
                }
            }
        }

        RowLayout {
            Repeater {
                model: root.modelData?.actions

                Rectangle {
                    id: action
                    required property NotificationAction modelData
                    color: area.pressed ? "#777" : area.containsMouse ? "#555" : "#333"

                    radius: 2

                    Layout.fillWidth: true

                    implicitHeight: label.implicitHeight + 8

                    MouseArea {
                        id: area
                        anchors.fill: parent
                        hoverEnabled: true
                        acceptedButtons: Qt.LeftButton
                        cursorShape: Qt.PointingHandCursor
                        onClicked: mouse => action.modelData.invoke()
                    }

                    Text {
                        id: label
                        anchors.centerIn: parent
                        color: "#ddd"
                        font.pixelSize: 14
                        font.family: "JetBrains Mono Nerd Font"
                        text: action.modelData.text
                    }
                }
            }
        }
    }

    Timer {
        interval: root.modelData?.expireTimeout > 0 ? root.modelData?.expireTimeout : 5000
        running: root.modelData?.urgency !== NotificationUrgency.Critical
        repeat: false
        onTriggered: root.modelData.expire()
    }
}
