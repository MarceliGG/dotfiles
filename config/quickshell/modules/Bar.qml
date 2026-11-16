import Quickshell.Io
import Quickshell

import Quickshell.Services.UPower
import Quickshell.Networking
import qs.services

import QtQuick.Layouts
import QtQuick

import qs.modules.bar

PanelWindow {
    id: bar
    color: "black"
    anchors {
        top: true
        right: true
        bottom: true
    }

    implicitWidth: 24

    ColumnLayout {
        anchors {
            top: parent.top
            left: parent.left
            right: parent.right
        }
        spacing: 0

        Workspaces {}
    }

    ColumnLayout {
        anchors {
            bottom: parent.bottom
            left: parent.left
            right: parent.right
        }
        spacing: 12

        SysTray {}
        BarTextItem {
            text: `${Audio.getIcon()}${Audio.volume}%`
        }
        BarTextItem {
            visible: UPower.displayDevice.isLaptopBattery
            color: UPower.displayDevice.state === UPowerDeviceState.Charging ? "#5f3" : "#ddd"

            function getIcon(pct) {
                if (pct > 0.8)
                    return " ";
                if (pct > 0.6)
                    return " ";
                if (pct > 0.4)
                    return " ";
                if (pct > 0.2)
                    return " ";
                return " ";
            }

            text: `${getIcon(UPower.displayDevice.percentage)}${Math.round(UPower.displayDevice.percentage * 100)}${UPower.displayDevice.state === UPowerDeviceState.Charging ? "" : "%"}`
        }
        BarTextItem {
            function formatWifiIcon(strength, connectivity) {
                switch (connectivity) {
                case NetworkConnectivity.Potal:
                    switch (strength) {
                    case 0:
                        return "󰤬 ";
                    case 1:
                        return "󰤡 ";
                    case 2:
                        return "󰤤 ";
                    case 3:
                        return "󰤧 ";
                    default:
                        return "󰤪 ";
                    }
                case NetworkConnectivity.Full:
                    switch (strength) {
                    case 0:
                        return "󰤯 ";
                    case 1:
                        return "󰤟 ";
                    case 2:
                        return "󰤢 ";
                    case 3:
                        return "󰤥 ";
                    default:
                        return "󰤨 ";
                    }
                case NetworkConnectivity.Limited:
                    switch (strength) {
                    case 0:
                        return "󰤫 ";
                    case 1:
                        return "󰤠 ";
                    case 2:
                        return "󰤣 ";
                    case 3:
                        return "󰤦 ";
                    default:
                        return "󰤩 ";
                    }
                case NetworkConnectivity.Unknown:
                    return " ";
                default:
                    return "󰤮 ";
                }
            }
            text: {
                const dev = Networking.devices.values.find(d => d.connected);
                switch (dev?.deviceType) {
                case DeviceType.WiFi:
                    const net = dev?.networks.values.find(n => n.connected);
                    if (!net)
                        return "󰤮 Disconnected";
                    return `${formatWifiIcon(Math.floor(net.signalStrength * 4), Networking.connectivity)}${net.name}`;
                case DeviceType.Wired:
                    return "󰈀 Wired";
                }
                return "󱘖 Disconnected";
            }
        }
        BarTextItem {
            text: Qt.formatDateTime(sys_clock.date, "󰃭 ddd MMM d 󰥔 hh:mm")
        }

        MouseArea {
            Layout.fillWidth: true
            Layout.preferredHeight: width
            acceptedButtons: Qt.LeftButton
            onClicked: () => wlogout.running = true
            Text {
                anchors.centerIn: parent
                color: "#d44"
                font.family: "JetBrains Mono Nerd Font"
                font.pixelSize: 14
                text: "⏻"
            }

            Process {
                id: wlogout
                running: false
                command: ["wlogout"]
            }
        }
    }
    SystemClock {
        id: sys_clock
        precision: SystemClock.Minutes
    }
}
