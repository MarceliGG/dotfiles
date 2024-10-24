import { root } from "../options.js";

const battery = await Service.import("battery");

const BatIcon = Widget.Icon({
  icon: battery.bind("icon_name").as(i => i),
  // icon: battery.bind("icon_name").as(i => `${root}/assets/bat/${i}.svg`),
});

const BatText = Widget.Label({
  label: battery.bind("percent").as((p) => `${p}`),
});

export default Widget.Box({
  vertical: true,
  name: "battery",
  children: [BatText, BatIcon],
});
