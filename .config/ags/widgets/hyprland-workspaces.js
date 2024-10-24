const hyprland = await Service.import("hyprland");

const Workspace = (ws) =>
  Widget.Button({
    class_name: hyprland.active.workspace
      .bind("id")
      .as((i) => (i == ws ? "active" : "")),
    child: Widget.Label(`${ws}`),
    onClicked: () => hyprland.messageAsync(`dispatch workspace ${ws}`),
  });

export default Widget.Box({
  vertical: true,
  hexpand: true,
  hpack: "center",
  name: "workspaces",
  children: [
    Workspace(1),
    Workspace(2),
    Workspace(3),
    Workspace(4),
    Workspace(5),
  ],
});
