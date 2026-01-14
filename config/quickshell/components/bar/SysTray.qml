import Quickshell
import Quickshell.Widgets
import Quickshell.Services.SystemTray

import QtQuick
import QtQuick.Layouts

ColumnLayout {
  id: sysTray
  implicitWidth: bar.width
  spacing: 2

  Repeater {
    model: SystemTray.items

    MouseArea {
      required property SystemTrayItem modelData
      id: trayItem

      QsMenuAnchor {
        anchor {
          window: bar
          item: trayItem
          edges: Edges.Top | Edges.Right 
         }

        id: menuAnchor
        menu: modelData.menu
      }

      implicitWidth: bar.width
      implicitHeight: bar.width

      acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
      onClicked: (m) => {
        if (m.button === Qt.RightButton) {
          modelData.activate()
        } else if (m.button === Qt.MiddleButton) {
          modelData.secondaryActivate()
        } else {
          menuAnchor.open()
        }
      }

      IconImage {
        anchors.centerIn: parent
        implicitSize: 16
        source: modelData.icon
        smooth: true
      }
    }
  }
}
