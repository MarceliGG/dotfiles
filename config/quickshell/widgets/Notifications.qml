import Quickshell.Services.Notifications
import Quickshell.Wayland
import Quickshell.Widgets
import Quickshell

import QtQuick.Layouts
import QtQuick

import qs.components.notificationpopup

PanelWindow {
  id: notifications
  color: "transparent"

  mask: Region {item: notifsList}
  WlrLayershell.layer: WlrLayer.Overlay

  property Notification n

  anchors {
    bottom: true
    top: true
  }

  exclusionMode: ExclusionMode.Ignore

  implicitWidth: 300

  ListView {
    spacing: 2
    height: contentHeight
    width: notifications.implicitWidth
    id: notifsList
    model: ns.trackedNotifications

    delegate: NotificationPopup {}

    displaced: Transition {
      NumberAnimation {
        property: "y"
        duration: 200
        easing.type: Easing.OutCubic
      }
    }
  }


  NotificationServer {
    id: ns
    onNotification: (notif) => {
      notif.tracked=true
    }
    actionsSupported: true
    imageSupported: true
  }
}
