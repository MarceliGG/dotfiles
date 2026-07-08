import QtQuick
import Quickshell.Io
import Quickshell.Networking

Text {
  function formatWifiIcon(strength, connectivity) {
    switch (connectivity) {
      case NetworkConnectivity.Potal:
        switch (strength) {
          case 0:
            return "󰤬 "
          case 1:
            return "󰤡 "
          case 2:
            return "󰤤 "
          case 3:
            return "󰤧 "
          default:
            return "󰤪 "
        }
      case NetworkConnectivity.Full:
        switch (strength) {
          case 0:
            return "󰤯 "
          case 1:
            return "󰤟 "
          case 2:
            return "󰤢 "
          case 3:
            return "󰤥 "
          default:
            return "󰤨 "
        }
      case NetworkConnectivity.Limited:
        switch (strength) {
          case 0:
            return "󰤫 "
          case 1:
            return "󰤠 "
          case 2:
            return "󰤣 "
          case 3:
            return "󰤦 "
          default:
            return "󰤩 "
        }
      case NetworkConnectivity.Unknown:
        return " "
      default:
        return "󰤮 "
    }
  }

  color: "#ddd"
  font.pixelSize: 14
  text: {
    const dev = Networking.devices.values.find(d=>d.connected)
    switch (dev?.deviceType) {
      case DeviceType.WiFi:
        const net = dev?.networks.values.find(n=>n.connected)
        if (!net)
          return "󰤮 Disconnected"
        return `${formatWifiIcon(Math.floor(net.signalStrength * 4), Networking.connectivity)}${net.name} [${Math.floor(net.signalStrength * 100)}%]`
      case DeviceType.Wired:
        return "󰈀 Wired"
    }
    return "󱘖 Disconnected"
  }
}
