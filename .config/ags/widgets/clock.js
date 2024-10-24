export default Widget.Label({
  hexpand: true,
  hpack: "center",
}).poll(10000, (label) => (label.label = Utils.exec('date "+%H\n%M"')));
