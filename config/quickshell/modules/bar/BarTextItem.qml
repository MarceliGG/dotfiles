import QtQuick.Layouts
import QtQuick

Item {
    id: root
    Layout.alignment: Qt.AlignHCenter
    implicitHeight: label.implicitWidth

    property string text: "n/a"
    property color color: "#ddd"

    Text {
        id: label

        x: (root.width - width) / 2
        y: (root.height - height) / 2

        color: root.color
        rotation: 90
        font.pixelSize: 14
        font.family: "JetBrains Mono Nerd Font"
        text: root.text
    }
}
