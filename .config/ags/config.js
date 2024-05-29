import Battery from "./widgets/battery.js"
import Clock from "./widgets/clock.js"
import Volume from "./widgets/volume.js"
import Network from "./widgets/network.js"
import Tray from "./widgets/systray.js"
import Workspaces from "./widgets/workspaces.js"

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

App.config({
  style: "./style.scss",
  windows: [Bar()],
});
