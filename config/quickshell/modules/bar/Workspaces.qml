import Quickshell.Hyprland
import QtQuick.Layouts
import QtQuick

Repeater {
    model: Hyprland.workspaces.values.filter(w => w.id > 0)
    delegate: Rectangle {
        Layout.fillWidth: true
        Layout.preferredHeight: width
        color: modelData.active ? "#26262a" : modelData.urgent ? "#993344" : "black"

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
