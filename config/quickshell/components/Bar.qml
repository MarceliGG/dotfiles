import Quickshell
import Quickshell.Io
import Quickshell.Widgets
import Quickshell.Hyprland

import QtQuick
import QtQuick.Layouts

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
        model: Hyprland.workspaces.values.filter(ws => ws.id > 0)
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
              font.family: fontF
              text: modelData.id
            }
          }
        }
      }

      Repeater {
        model: Hyprland.workspaces.values.find(ws => ws.name === "special:minimize")?.toplevels

        delegate: MouseArea {
          implicitWidth: bar.implicitWidth
          implicitHeight: implicitWidth
          acceptedButtons: Qt.LeftButton

          onClicked: () => Hyprland.dispatch(
            `hl.dsp.window.move({workspace = "${Hyprland.focusedWorkspace.id}", window = "address:0x${modelData.address}"})`
          )

          IconImage {
            id: image
            implicitSize: 18
            anchors.centerIn: parent
            source: Quickshell.iconPath(modelData.wayland.appId)
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
        font.family: fontF
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
