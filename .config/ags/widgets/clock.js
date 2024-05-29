export default Widget.Label().poll(
  10000,
  (label) => (label.label = Utils.exec('date "+%H:%M %d/%m/%Y"')),
);
