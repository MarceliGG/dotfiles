import Quickshell
import Quickshell.Widgets
import Quickshell.Services.SystemTray

import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: sysTray
    spacing: 2

    Repeater {
        model: SystemTray.items

        MouseArea {
            id: trayItem
            required property SystemTrayItem modelData

            QsMenuAnchor {
                id: menuAnchor
                anchor {
                    window: bar
                    item: trayItem
                    edges: Edges.Top | Edges.Right
                }
                menu: modelData.menu
            }

            Layout.fillWidth: true
            Layout.preferredHeight: width

            acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
            onClicked: m => {
                if (m.button === Qt.RightButton) {
                    modelData.activate();
                } else if (m.button === Qt.MiddleButton) {
                    modelData.secondaryActivate();
                } else {
                    menuAnchor.open();
                }
            }

            IconImage {
                anchors.centerIn: parent
                implicitSize: 20
                source: modelData.icon
                smooth: true
            }
        }
    }
}
