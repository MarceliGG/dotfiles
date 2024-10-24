const notifications = await Service.import("notifications");
notifications.popupTimeout = 5000;
notifications.forceTimeout = false;
notifications.cacheActions = false;
notifications.clearDelay = 100;
function NotificationIcon({ app_entry, app_icon, image }) {
  if (image) return Widget.Icon(image);

  let icon = "dialog-information-symbolic";
  if (Utils.lookUpIcon(app_icon)) icon = app_icon;
  else if (app_entry && Utils.lookUpIcon(app_entry)) icon = app_entry;

  return Widget.Icon(icon);
}

const Notification = (notif) =>
  Widget.EventBox({
    class_name: "popup",
    on_secondary_click: notif.dismiss,
    child: Widget.Box({
      vertical:true,
      children: [
        Widget.Box({
          class_name: "data",
          children: [
            NotificationIcon(notif),
            Widget.Box({
              vertical: true,
              children: [
                Widget.Label({
                  class_name: "title",
                  label: notif.summary,
                }),
                Widget.Label({
                  class_name: "content",
                  label: notif.body,
                }),
              ],
            }),
          ],
        }),
        Widget.Box({
          class_name: "actions",
          children: notif.actions.map(({ id, label }) => Widget.Button({
            class_name: "action-button",
            on_clicked: () => {
              notif.invoke(id)
              notif.dismiss()
            },
            hexpand: true,
            child: Widget.Label(label),
          }))
        })
      ],
    }),
  });

export default (monitor=0) => {
  return Widget.Window({
  monitor,
  layer: "overlay",
  class_name: "notifications",
  name: `notifications${monitor}`,
  margins: [4, 4, 0, 0],
  anchor: ["top", "right"],
  child: Widget.Box({
  vertical: true,
  css: "min-width: 2px; min-height: 2px;",
  children: notifications
    .bind("popups")
    .as((n) => n.map((no) => Notification(no))),
})})};
