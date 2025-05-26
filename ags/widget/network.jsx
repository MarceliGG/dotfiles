import Network from "gi://AstalNetwork";
import { bind, Variable } from "astal";
import { Gtk } from "astal/gtk3";

export default function Net() {
  const network = Network.get_default();
  const wifi = bind(network, "wifi");

  bind(network, "primary").as(p => p===0)
  return (
    <box
      className="network status"
    // visibleChildName={bind(network, "primary").as(p => {
    //   switch (p) {
    //     case 0:
    //       return "network-unknown";
    //     case 1:
    //       return "network-wired";
    //     case 2:
    //       return "network-wifi";
    //   }
    // })}
    >
      {wifi.as(wifi => wifi && (<box
        visible={bind(network, "primary").as(p => p===2)}
        halign={Gtk.Align.END}
        // hexpand
        name="network-wifi"
      >
        <icon
          icon={bind(wifi, "iconName")}
        />
        <label label={bind(wifi, "ssid").as(String)} />
      </box>))}
      <box
        halign={Gtk.Align.END}
        // halign={Gtk.Align.CENTER}
        // hexpand
        visible={bind(network, "primary").as(p => p===1)}
        name="network-wired"
      >
        <icon
          icon="network-wired-symbolic"
        />
        <label label="WIRED" />
      </box>
      <box
        halign={Gtk.Align.END}
        // halign={Gtk.Align.CENTER}
        // hexpand
        visible={bind(network, "primary").as(p => p===0)}
        name="network-unknown"
      >
        <icon
          icon="network-wired-disconnected-symbolic"
        />
        <label label="DISCONNECTED" />
      </box>
    </box>
  );
}
