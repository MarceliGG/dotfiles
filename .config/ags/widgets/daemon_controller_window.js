const daemon = (bin, sudo = false) =>
  Widget.Button({
    onPrimaryClickRelease: (btn) => {
      const state = Utils.exec(["pidof", `${bin}`]) !== "";
      btn.child.children[1].active = !state;
      let cmd;
      if (state) cmd = ["pkill", bin];
      else cmd = [bin];
      if (sudo) cmd = ["pkexec"].concat(cmd);
      Utils.execAsync(cmd).catch((err) => {
        btn.child.children[1].active = state;
        // if ()
        // Utils.notify({
        //   summary: `${bin}`,
        //   body: err,
        //   iconName: "dialog-error-symbolic",
        // });
      });
    },
    child: Widget.Box({
      children: [
        Widget.Label({
          hexpand: true,
          hpack: "start",
          label: `${bin}`,
        }),
        Widget.Switch({
          onActivate: ({ active }) => {},
          setup: (self) => {
            self.active = Utils.exec(["pidof", `${bin}`]) !== "";
          },
        }),
      ],
    }),
  });

export default (monitor = 0) =>
  Widget.Window({
    monitor,
    name: "daemon-controller-window",
    visible: false,
    anchor: ["bottom", "right"],
    margins: [0, 2, 120, 0],
    child: Widget.Box({
      vertical: true,
      children: [
        daemon("dockerd", true),
        daemon("libvertd", true),
        daemon("kdeconnectd"),
      ],
    }),
  });
