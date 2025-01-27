import { Variable, GLib, bind } from "astal";
import { Astal, Gtk } from "astal/gtk3";
import Battery from "gi://AstalBattery";
import Workspaces from "./workspaces";
import Tray from "./tray";
import Wp from "gi://AstalWp";
import Network from "gi://AstalNetwork";

function Clock() {
  return (
    <box
      className="clock status"
      halign={Gtk.Align.CENTER}
      hexpand
    >
      <label
        label={Variable("").poll(1000, () =>
          GLib.DateTime.new_now_local().format("%H:%M %A %d/%m/%Y"),
        )()}
      />
    </box>
  );
}

function BatteryLevel() {
  const bat = Battery.get_default();
  const icons = {
    // battery icons from nerd fonts https://www.nerdfonts.com/
    "battery-level-0-charging-symbolic": "󰢟",
    "battery-level-10-charging-symbolic": "󰢜",
    "battery-level-20-charging-symbolic": "󰂆",
    "battery-level-30-charging-symbolic": "󰂇",
    "battery-level-40-charging-symbolic": "󰂈",
    "battery-level-50-charging-symbolic": "󰢝",
    "battery-level-60-charging-symbolic": "󰂉",
    "battery-level-70-charging-symbolic": "󰢞",
    "battery-level-80-charging-symbolic": "󰂊",
    "battery-level-90-charging-symbolic": "󰂋",
    "battery-level-100-charged-symbolic": "󰂅",
    "battery-level-0-symbolic": "󰂎",
    "battery-level-10-symbolic": "󰁺",
    "battery-level-20-symbolic": "󰁻",
    "battery-level-30-symbolic": "󰁼",
    "battery-level-40-symbolic": "󰁽",
    "battery-level-50-symbolic": "󰁾",
    "battery-level-60-symbolic": "󰁿",
    "battery-level-70-symbolic": "󰂀",
    "battery-level-80-symbolic": "󰂁",
    "battery-level-90-symbolic": "󰂂",
    "battery-level-100-symbolic": "󰁹",
  };
  return (
    <box
      className="battery status"
      hexpand
    >
      <label
        className="icon"
        label={bind(bat, "batteryIconName").as((b) => icons[b])}
      />
      <label
        label={bind(bat, "percentage").as((p) => `${Math.floor(p * 100)}%`)}
      />
    </box>
  );
}

function Volume() {
  const speaker = Wp.get_default()?.audio.defaultSpeaker;

  return (
    <box className="volume status">
      <icon icon={bind(speaker, "volumeIcon")} />
      <label label={bind(speaker, "volume").as((p) => `${Math.floor(p * 100)}%`)} />
    </box>
  );
}

export default function Bar(monitor) {
  const { TOP, RIGHT, LEFT } = Astal.WindowAnchor;

  const network = Network.get_default();
  const wifi = bind(network, "wifi");

  return (
    <window
      className="Bar"
      namespace="ags-bar"
      gdkmonitor={monitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
    >
      <centerbox>
        <box className="segment start" halign={Gtk.Align.START}>
          <Workspaces />
        </box>
        <box className="segment center">
          <Clock />
        </box>
        <box className="segment end" halign={Gtk.Align.END} >
          <Tray />
          <box
            className="network status"
            halign={Gtk.Align.CENTER}
            hexpand
          >
            {wifi.as(
              (wifi) =>
                wifi && (
                  <icon
                    tooltipText={bind(wifi, "ssid").as(String)}
                    icon={bind(wifi, "iconName")}
                  />
                ),
            )}
            {wifi.as(
              (wifi) =>
                wifi && (
                  <label label={bind(wifi, "ssid")} />
                ),
            )}
          </box>
          <BatteryLevel />
          <Volume />
        </box>
      </centerbox>
    </window >
  );
}
