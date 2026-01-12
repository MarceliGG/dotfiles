import Quickshell
import Quickshell.Io
import Quickshell.Widgets
import Quickshell.Services.SystemTray
import QtQuick
import QtQuick.Layouts
import QtNetwork
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

  property var tags: {"1": null, "2": null, "3": null, "4": null, "5": null, "6": null, "7": null, "8": null, "9": null}
  
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
        model: 9
        delegate: Rectangle {
          Component.onCompleted: {
            bar.tags[`${index+1}`] = this
          }
          Component.onDestruction: {
            bar.tags[`${index+1}`] = null
          }

          width: bar.implicitWidth
          height: width
          color: "black"


          MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            onClicked: (m) => {
              if (m.button === Qt.RightButton) {
                mmsgToggle.idx = `${index+1}`
                print(mmsgToggle.idx, mmsgToggle.command)
                mmsgToggle.running = true
              } else {
                mmsgSwitch.idx = `${index+1}`
                mmsgSwitch.running = true
              }
            }
            Text {
              anchors.centerIn: parent
              color: "#ddd"
              font.pixelSize: 14
              font.family: fontF
              text: `${index+1}`
            }
          }
        }
      }
      
    }
  }

  ColumnLayout {
    id: sysTray
    // implicitHeight: sysTrayLayout.implicitHeight
    // anchors.horizontalCenter: parent.horizontalCenter
    anchors.bottom: bottom.top
    anchors.bottomMargin: 8
    implicitWidth: bar.width

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

      Text {
        function formatNetwork(medium) {
          switch (medium) {
            case NetworkInformation.TransportMedium.Ethernet:
              return "󰈀 Ethernet"
            case NetworkInformation.TransportMedium.WiFi:
              nmcli.running = true
              return `󰖩 ${nmcli.ssid}`
            case NetworkInformation.TransportMedium.Unknown:
              return " Disconnected"
            default:
              return "network: (switch)default reached!"
          }
        }

        color: "#ddd"
        font.pixelSize: 14
        font.family: fontF
        text: formatNetwork(NetworkInformation.transportMedium)
      }

      Battery {}
      Volume {
        implicitHeight: parent.implicitWidth
      }
    }
  }

  Process {
    id: mmsgSwitch
    property string idx: "1"
    command: ["mmsg", "-t", mmsgSwitch.idx]
  }

  Process {
    id: mmsgToggle
    property string idx: "1"
    command: ["mmsg", "-s", "-t", mmsgToggle.idx + "^"]
  }

  Process {
    id: nmcli

    property string ssid: "[wait..]"

    command: ["nmcli", "-t", "-f", "active,ssid", "dev", "wifi"]

    stdout: StdioCollector {
      onStreamFinished: {
        for (const line of text.split("\n")) {
          if (line.startsWith("yes:")) {
            nmcli.ssid = line.substring(4, line.length)
            break
          }
        }
      }
    }
  }

  Process {
    id: mmsg

    running: true
    command: ["mmsg", "-w", "-t"]
   
    stdout: SplitParser {
      onRead: (data) => {
        if (!data.includes(" tag ")) return
        const d = data.split(" ")
        bar.tags[d[2]].color = d[3] !== "0" ? "#3f3f4a" : d[4] !== "0" ? "#1b1b22" : "black"
      }
    }
  }

  SystemClock {
    id: sys_clock
    precision: SystemClock.Minutes
  }
}
