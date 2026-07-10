import Quickshell.Hyprland
import Quickshell

import QtQuick.Layouts
import QtQuick

import qs.components.bar

PanelWindow {
  id: bar
  color: "black"
  anchors {
    top: true
    left: true
    bottom: true
  }
 
  implicitWidth: 22

  Item {
    id: top
    implicitHeight: topLayout.implicitHeight
    anchors.horizontalCenter: parent.horizontalCenter
    anchors.top: parent.top
    anchors.topMargin: 0

    ColumnLayout {
      id: topLayout
      anchors.centerIn: parent
      spacing: 0
      
      Repeater {
        model: Hyprland.workspaces
        delegate: Rectangle {
          implicitWidth: bar.implicitWidth
          implicitHeight: implicitWidth
          color: modelData.active ? "#333" : "black"

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
    }
  }

  SysTray {
    anchors.bottom: bottom.top
    anchors.bottomMargin: 8
  }

  Item {
    id: bottom
    implicitHeight: bottomLayout.implicitWidth
    anchors.horizontalCenter: parent.horizontalCenter
    anchors.bottom: parent.bottom
    anchors.bottomMargin: 8
    implicitWidth: parent.width

    RowLayout {
      id: bottomLayout
      anchors.centerIn: parent
      rotation: -90
      spacing: 16

      Text {
        color: "#ddd"
        font.pixelSize: 14
        text: Qt.formatDateTime(sys_clock.date, "d MMM yyyy | hh:mm");
      }

      Network {}
      Battery {}
      Volume {
        implicitHeight: parent.implicitWidth
      }
    }
  }

  SystemClock {
    id: sys_clock
    precision: SystemClock.Minutes
  }
}
