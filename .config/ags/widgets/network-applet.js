const network = await Service.import("network");
import { execAsync, notify } from "resource:///com/github/Aylur/ags/utils.js";

export default (monitor = 0) =>
  Widget.Window({
    monitor,
    name: `network-applet`,
    // className: "network-applet",
    visible: false,
    anchor: ["top", "right"],
    child: Widget.Scrollable({
      hscroll: "never",
      child: Widget.Box({
        vertical: true,
        children: [
          Widget.Button({
            child: Widget.Box({
              children: [],
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
            ssid: "Not connected to wifi",
            iconName: "network-wireless-offline-symbolic",
          };
          aps.splice(con_idx, 1);
        } else
          connected = {
            ssid: "Not connected to wifi",
            iconName: "network-wireless-offline-symbolic",
          };
        // END: Get list of wireless access points and find connected one
        self.children[0].child.children = [
          Widget.Icon(connected["iconName"]),
          Widget.Label(connected["ssid"]),
        ];
        self.children[1].children = aps.map((ap) =>
          Widget.Button({
            on_clicked: () =>
              execAsync(`nmcli device wifi connect ${ap.ssid}`)
                .catch((e) => {
                  notify({
                    summary: "Network",
                    body: e,
                    actions: {
                      "Connect using nmtui": () =>
                        execAsync(
                          `alacritty -e nmtui connect ${ap.ssid}`,
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
