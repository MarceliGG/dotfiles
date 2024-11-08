export default Widget.EventBox({
  hexpand: true,
  hpack: "center",
  on_primary_click_release: () => App.toggleWindow("calendar"),
  child: Widget.Box({
    hexpand: true,
    hpack: "center",
    vertical: true,
    children: [
      Widget.Label({
        hexpand: true,
        hpack: "center",
      }).poll(10000, (label) => (label.label = Utils.exec('date "+%H"'))),
      Widget.Label({
        hexpand: true,
        hpack: "center",
      }).poll(10000, (label) => (label.label = Utils.exec('date "+%M"'))),
    ],
  }),
});
