import QtQuick
import QtNetwork
import Quickshell.Io

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
}
