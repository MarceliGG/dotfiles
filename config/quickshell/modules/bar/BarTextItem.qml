import QtQuick.Layouts
import QtQuick

Item {
    id: root
    implicitWidth: parent.width
    implicitHeight: row.implicitWidth

    property string text: "n/a"
    property string icon: ""
    property color color: "#ddd"

    Row {
        id: row

        transformOrigin: Item.TopLeft
        x: (root.width + height) / 2
        y: 0
        rotation: 90
        spacing: 2

        Text {
            id: iconlabel
            anchors.verticalCenter: parent.verticalCenter
            font.pixelSize: 18
            color: root.color
            font.family: "JetBrainsMono Nerd Font"
            text: root.icon
        }

        Text {
            id: label
            anchors.verticalCenter: parent.verticalCenter
            color: root.color
            font.pixelSize: 14
            text: root.text
        }
    }
}
