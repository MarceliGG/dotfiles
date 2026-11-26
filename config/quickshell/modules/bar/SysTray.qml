import Quickshell.Services.SystemTray
import Quickshell.Widgets
import Quickshell

import QtQuick.Layouts
import QtQuick

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
                    item: trayItem
                    gravity: Edges.Left | Edges.Bottom
                }
                menu: trayItem.modelData.menu
            }

            Layout.fillWidth: true
            Layout.preferredHeight: width

            acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
            onClicked: m => {
                if (modelData.onlyMenu || m.button === Qt.RightButton) {
                    menuAnchor.open();
                } else if (m.button === Qt.MiddleButton) {
                    modelData.secondaryActivate();
                } else {
                    modelData.activate();
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
