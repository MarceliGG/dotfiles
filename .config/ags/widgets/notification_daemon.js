const notifications = await Service.import("notifications");
notifications.popupTimeout = 3000;
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
    on_primary_click: () => {
      notif.invoke("View");
    },
    on_secondary_click: notif.dismiss,
    child: Widget.Box({
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
  });

export default Widget.Box({
  vertical: true,
  css: "min-width: 2px; min-height: 2px;",
  children: notifications
    .bind("popups")
    .as((n) => n.map((no) => Notification(no))),
});