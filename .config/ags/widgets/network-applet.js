const network = await Service.import("network");

export default (monitor = 0) =>
  Widget.Window({
    monitor,
    name: "network-applet",
    visible: false,
    anchor: ["bottom", "right"],
    margins: [0, 2, 2, 0],
    child: Widget.Scrollable({
      hscroll: "never",
      child: Widget.Box({
        vertical: true,
        children: [
            Widget.Box({
              className: "current",
              children: [],
            }),
          Widget.Button({
            onClicked: (btn) => {
              btn.child.children[1].active = !btn.child.children[1].active;
            },
            child: Widget.Box({
              children: [
                Widget.Label({
                  label: "Wifi State",
                  hexpand: true,
                  hpack: "start",
                }),
                Widget.Switch({
                  onActivate: ({ active }) => (network.wifi.enabled = active),
                  setup: (self) => {
                    self.active = network.wifi.enabled;
                  },
                }),
              ],
            }),
          }),
          Widget.Box({
            vertical: true,
            children: [],
          }),
        ],
      }).hook(network, (self) => {
        // START: Get list of wireless access points and find connected one
        const aps = Object.values(
          network.wifi.access_points.reduce((acc, ap) => {
            if (!acc[ap.ssid]) acc[ap.ssid] = ap;
            if (ap.active) acc[ap.ssid].active = true;
            return acc;
          }, {}),
        );
        let connected;
        if (network.primary === "wifi") {
          const con_idx = aps.findIndex((ap) => ap.active);
          connected = aps[con_idx] || {
            ssid: " [Disconnected]",
            iconName: "network-wireless-offline-symbolic",
          };
          aps.splice(con_idx, 1);
        } else
          connected = {
            ssid: " [Not Using WiFi]",
            iconName: "network-wireless-offline-symbolic",
          };
        // END: Get list of wireless access points and find connected one
        self.children[0].children = [
          Widget.Icon(connected["iconName"]),
          Widget.Label(" " + connected["ssid"]),
        ];
        self.children[2].children = aps.map((ap) =>
          Widget.Button({
            on_clicked: () =>
              Utils.execAsync(`nmcli device wifi connect "${ap.ssid}"`)
                .catch((e) => {
                  Utils.notify({
                    summary: "Network",
                    body: e,
                    actions: {
                      "Connect using nmtui": () =>
                        Utils.execAsync(
                          `alacritty -e nmtui connect "${ap.ssid}"`,
                        ).catch(print),
                    },
                  });
                })
                .catch((e) => console.error(e)),
            child: Widget.Box({
              children: [Widget.Icon(ap["iconName"]), Widget.Label(ap["ssid"])],
            }),
          }),
        );
      }),
    }),
  });
