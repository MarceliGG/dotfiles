import { App } from "astal/gtk3";
import Battery from "./widgets/battery.js";
import Clock from "./widgets/clock.js";
import Volume from "./widgets/volume.js";
import Network from "./widgets/network.js";
import Tray from "./widgets/systray.js";
import Notifications from "./widgets/notification_daemon.js";
import PopupOsd from "./widgets/osd.js";
import HyprlandWorkspaces from "./widgets/hyprland-workspaces.js";
import NetworkApplet from "./widgets/network-applet.js";
import Calendar from "./widgets/calendar.js";
import Controller from "./widgets/daemon_controller.js";
import ControllerWindow from "./widgets/daemon_controller_window.js";

const Start = Widget.Box({
  name: "start",
  vexpand: true,
  children: [HyprlandWorkspaces],
});

const Center = Widget.Box({
  name: "center",
  vpack: "center",
  children: [Clock],
});

const End = Widget.Box({
  vertical: true,
  name: "end",
  vpack: "end",
  vexpand: true,
  children: [Tray, Controller, Battery, Volume, Network],
});

const Bar = (monitor = 0) =>
  new Widget.Window({
    exclusivity: "exclusive",
    monitor,
    name: "bar",
    anchor: ["top", "right", "bottom"],
    child: Widget.CenterBox({
      vertical: true,
      startWidget: Start,
      centerWidget: Center,
      endWidget: End,
    }),
  });

const Osd = (monitor = 0) =>
  new Widget.Window({
    monitor,
    name: `osd${monitor}`,
    class_name: "osd",
    layer: "overlay",
    click_through: true,
    css: "background: none;",
    child: Widget.Box({
      css: "background: none; min-width: 2px; min-height: 2px",
      child: PopupOsd(),
    }),
  });

App.start({
  main() {
    Bar();
    Notifications();
    Osd();
    NetworkApplet();
    Calendar();
    ControllerWindow();
  },
});
