const network = await Service.import("network");
export default Widget.Button({
  on_primary_click_release: () => App.toggleWindow("network-applet"),
  name: "network",
  child: Widget.Icon().hook(network, (self) => {
    const icon = network[network.primary || "wifi"]?.icon_name;
    self.icon = icon || "";
  }),
});
