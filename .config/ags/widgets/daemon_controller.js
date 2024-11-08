export default Widget.Button({
  name: "daemon-controller",
  onPrimaryClickRelease: (btn) => {
    App.toggleWindow("daemon-controller-window");
  },
  child: Widget.Icon({
    icon: "system-run-symbolic",
  }),
});
