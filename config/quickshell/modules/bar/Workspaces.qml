import Quickshell.Hyprland
import QtQuick.Layouts
import QtQuick

Repeater {
    model: Hyprland.workspaces
    delegate: Rectangle {
        Layout.fillWidth: true
        Layout.preferredHeight: width
        color: modelData.active ? "#26262a" : "black"

        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton
            onClicked: () => modelData.activate()
            Text {
                anchors.centerIn: parent
                color: "#ddd"
                font.pixelSize: 14
                text: modelData.id
            }
        }
    }
}
