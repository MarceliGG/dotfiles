import QtQuick

Column {
    id: root

    property string text: "n/a"
    property string icon: ""
    property color color: "#ddd"
    property int iconSize: 18

    Text {
        id: iconlabel
        height: root.iconSize + 6
        x: (root.width - width) / 2
        font.pixelSize: root.iconSize
        color: root.color
        font.family: "JetBrainsMono Nerd Font"
        text: root.icon
    }

    Item {
        height: label.implicitWidth
        anchors.horizontalCenter: parent.horizontalCenter
        implicitWidth: bar.width
        Text {
            id: label
            transformOrigin: Item.TopLeft
            x: (root.width + height) / 2
            y: 0
            rotation: 90
            color: root.color
            font.pixelSize: 14
            text: root.text
        }
    }
}
