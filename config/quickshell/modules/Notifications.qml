import Quickshell.Services.Notifications
import Quickshell.Wayland
import Quickshell

import QtQuick

import qs.modules.notifications

PanelWindow {
    id: notifications
    color: "transparent"

    mask: Region {
        item: notifsList
    }
    WlrLayershell.layer: WlrLayer.Overlay

    property Notification n

    anchors {
        bottom: true
        top: true
        left: true
    }

    margins {
        top: 4
        left: 24
    }

    exclusionMode: ExclusionMode.Ignore

    implicitWidth: 304

    ListView {
        id: notifsList
        spacing: 2
        height: contentHeight
        width: notifications.implicitWidth
        model: ns.trackedNotifications

        delegate: NotificationPopup {}

        add: Transition {
            NumberAnimation {
                property: "x"
                from: -300
                to: 4
                duration: 150
            }
        }

        remove: Transition {
            NumberAnimation {
                property: "x"
                to: -300
                duration: 150
            }
        }

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
        onNotification: notif => {
            notif.tracked = true;
        }
        actionsSupported: true
        imageSupported: true
    }
}
