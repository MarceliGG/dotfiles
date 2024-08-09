import Battery from "./widgets/battery.js";
import Clock from "./widgets/clock.js";
import Volume from "./widgets/volume.js";
import Network from "./widgets/network.js";
import Tray from "./widgets/systray.js";
import Workspaces from "./widgets/workspaces.js";
import NotificationD from "./widgets/notification_daemon.js";
import PopupOsd from "./widgets/osd.js";

const Start = Widget.Box({
  name: "start",
  hexpand: true,
  children: [Workspaces],
});

const Center = Widget.Box({
  name: "center",
  hpack: "center",
  children: [Clock],
});

const End = Widget.Box({
  name: "end",
  hpack: "end",
  hexpand: true,
  children: [Tray, Battery, Volume, Network],
});

const Bar = (monitor = 0) =>
  Widget.Window({
    exclusivity: "exclusive",
    monitor,
    class_name: "bar",
    name: `bar${monitor}`,
    anchor: ["top", "left", "right"],
    child: Widget.CenterBox({
      startWidget: Start,
      centerWidget: Center,
      endWidget: End,
    }),
  });

const Notifications = (monitor = 0) =>
  Widget.Window({
    monitor,
    layer: "overlay",
    class_name: "notifications",
    name: `notifications${monitor}`,
    margins: [4, 0, 0, 0],
    anchor: ["top"],
    child: NotificationD,
  });

const Osd = (monitor = 0) =>
  Widget.Window({
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

// END TESTING

App.config({
  style: "./style.css",
  windows: [Bar(), Notifications(), Osd()],
});
