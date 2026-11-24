import Quickshell.Services.Notifications
import Quickshell.Wayland
import Quickshell

import QtQuick

import qs.modules.notifications
import qs.services

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
    }

    margins {
        top: 4
    }

    exclusionMode: ExclusionMode.Ignore

    implicitWidth: 300

    ListView {
        id: notifsList
        spacing: 4
        height: contentHeight
        width: notifications.implicitWidth
        model: NotifServer.trackedNotifications

        delegate: NotificationPopup {}

        add: Transition {
            NumberAnimation {
                property: "scale"
                from: 0
                to: 1
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
}
