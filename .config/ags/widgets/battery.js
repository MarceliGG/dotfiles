import { root } from "../options.js";

const battery = await Service.import("battery");

const BatIcon = Widget.Icon({
  icon: battery.bind("icon_name").as(p => `${root}/assets/bat/${p}.svg`),
  // icon: battery.bind("percent").as((p) => {
  //   if (p > 90) {
  //     return `${root}/assets/bat/100.svg`;
  //   } else if (p > 80) {
  //     return `${root}/assets/bat/90.svg`;
  //   } else if (p > 70) {
  //     return `${root}/assets/bat/80.svg`;
  //   } else if (p > 60) {
  //     return `${root}/assets/bat/70.svg`;
  //   } else if (p > 50) {
  //     return `${root}/assets/bat/60.svg`;
  //   } else if (p > 40) {
  //     return `${root}/assets/bat/50.svg`;
  //   } else if (p > 30) {
  //     return `${root}/assets/bat/40.svg`;
  //   } else if (p > 20) {
  //     return `${root}/assets/bat/30.svg`;
  //   } else if (p > 10) {
  //     return `${root}/assets/bat/20.svg`;
  //   } else {
  //     return `${root}/assets/bat/10.svg`;
  //   }
  // }),
});

const BatText = Widget.Label({
  label: battery.bind("percent").as((p) => `${p}%`),
});

export default Widget.Box({
  name: "battery",
  children: [BatText, BatIcon],
});
