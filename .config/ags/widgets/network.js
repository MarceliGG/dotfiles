const network = await Service.import("network");

// const WifiLabel = Widget.Label().hook(network, self =>{
//     print(`wifi: ${network[network.primary]}`)
//     return self["ssid"] || 'Unknown'});
// const WifiIcon = Widget.Icon({icon: network["wifi"].bind("icon-name")})
// const EthIcon = Widget.Icon({icon: network["wired"].bind("icon-name")})

// const Wifi = Widget.Box({
//     children: [WifiLabel, WifiIcon]
// })

// const Wired = Widget.Box({
//     children: [Widget.Label("[Wired]"), EthIcon]
// })

// const Disconnected = Widget.Box({
//     children: [Widget.Label("[Disconnected]")]
// })

export default Widget.EventBox({
          on_primary_click_release: () => App.toggleWindow("network-applet"),
  child: Widget.Box({
    name: "network",
    children: [
      Widget.Label().hook(network, (self) => {
        const label =
          network.primary === "wifi"
            ? network[network.primary].ssid || "Unknown"
            : network.primary
              ? "[Wired]"
              : "[Disconnected]";
        self.label = label;
      }),
      Widget.Icon().hook(network, (self) => {
        const icon = network[network.primary || "wifi"]?.icon_name;
        self.icon = icon || "";
      }),
    ],
  }),
});
// Widget.Stack({
//     name: "network",
//     children: {
//         wifi: Wifi,
//         // a: Disconnected,
//         wired: Wired,
//     },
//     shown: network.bind('primary').as(p => {
//         print(`shown: ${p}`)
//         return p || "wifi"}),
// })
