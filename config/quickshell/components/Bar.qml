import Quickshell
import Quickshell.Io
import Quickshell.Hyprland

import QtQuick
import QtQuick.Layouts

import qs.components.bar

PanelWindow {
  id: bar
  color: "black"
  anchors {
    top: true
    // right: true
    left: true
    bottom: true
  }

  // property var tags: {"1": null, "2": null, "3": null, "4": null, "5": null, "6": null, "7": null, "8": null, "9": null}
  
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
              font.family: fontF
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

  // Process {
  //   id: mmsgSwitch
  //   property string idx: "1"
  //   command: ["mmsg", "-t", mmsgSwitch.idx]
  // }

  // Process {
  //   id: mmsgToggle
  //   property string idx: "1"
  //   command: ["mmsg", "-s", "-t", mmsgToggle.idx + "^"]
  // }

  // Process {
  //   id: mmsg

  //   running: true
  //   command: ["mmsg", "-w", "-t"]
   
  //   stdout: SplitParser {
  //     onRead: (data) => {
  //       if (!data.includes(" tag ")) return
  //       const d = data.split(" ")
  //       bar.tags[d[2]].color = d[3] !== "0" ? "#3f3f4a" : d[4] !== "0" ? "#1b1b22" : "black"
  //     }
  //   }
  // }

  SystemClock {
    id: sys_clock
    precision: SystemClock.Minutes
  }
}
