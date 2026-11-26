import Quickshell.Services.UPower
import Quickshell.Networking
import Quickshell

import qs.modules.bar
import qs.services

import QtQuick.Layouts
import QtQuick

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
        spacing: 8

        SysTray {}
        BarTextItem {
            icon: Audio.getIcon()
            text: `${Audio.volume}%`
        }
        BarTextItem {
            visible: UPower.displayDevice.isLaptopBattery
            color: UPower.displayDevice.state === UPowerDeviceState.Charging ? "#5f3" : "#ddd"

            function getIcon(pct) {
                if (pct > 0.75)
                    return "󱊣";
                if (pct > 0.50)
                    return "󱊢";
                if (pct > 0.25)
                    return "󱊡";
                return "󰂎";
            }

            iconSize: 24
            icon: getIcon(UPower.displayDevice.percentage)
            text: `${Math.round(UPower.displayDevice.percentage * 100)}${UPower.displayDevice.state === UPowerDeviceState.Charging ? "" : "%"}`
        }

        BarTextItem {
            function formatWifiIcon(strength, connectivity) {
                switch (connectivity) {
                case NetworkConnectivity.Potal:
                    switch (strength) {
                    case 0:
                        return "󰤬";
                    case 1:
                        return "󰤡";
                    case 2:
                        return "󰤤";
                    case 3:
                        return "󰤧";
                    default:
                        return "󰤪";
                    }
                case NetworkConnectivity.Full:
                    switch (strength) {
                    case 0:
                        return "󰤯";
                    case 1:
                        return "󰤟";
                    case 2:
                        return "󰤢";
                    case 3:
                        return "󰤥";
                    default:
                        return "󰤨";
                    }
                case NetworkConnectivity.Limited:
                    switch (strength) {
                    case 0:
                        return "󰤫";
                    case 1:
                        return "󰤠";
                    case 2:
                        return "󰤣";
                    case 3:
                        return "󰤦";
                    default:
                        return "󰤩";
                    }
                case NetworkConnectivity.Unknown:
                    return "";
                default:
                    return "󰤮";
                }
            }
            readonly property var dev: Networking.devices.values.find(d => d.connected)
            readonly property var net: dev?.deviceType === DeviceType.WiFi ? dev.networks.values.find(n => n.connected) : null

            icon: {
                switch (dev?.deviceType) {
                case DeviceType.WiFi:
                    if (!net)
                        return "󰤮";
                    return formatWifiIcon(Math.floor(net.signalStrength * 4), Networking.connectivity).trim();
                case DeviceType.Wired:
                    return "󰈀";
                }
                return "󱘖";
            }

            text: {
                switch (dev?.deviceType) {
                case DeviceType.WiFi:
                    return net ? net.name : "Disconnected";
                case DeviceType.Wired:
                    return "Wired";
                }
                return "Disconnected";
            }
        }
        BarTextItem {
            icon: "󰥔"
            text: Qt.formatDateTime(sys_clock.date, "hh:mm - ddd MMM d")
        }

        MouseArea {
            Layout.fillWidth: true
            Layout.preferredHeight: width
            acceptedButtons: Qt.LeftButton
            onClicked: () => Quickshell.execDetached("wlogout")
            Text {
                anchors.centerIn: parent
                color: "#d44"
                font.family: "JetBrains Mono Nerd Font"
                font.pixelSize: 14
                text: "⏻"
            }
        }
    }
}
