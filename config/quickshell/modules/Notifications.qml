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
        model: ns.trackedNotifications

        delegate: NotificationPopup {}

        add: Transition {
            NumberAnimation {
                property: "scale"
                from: 0
                to: 1
                duration: 150
            }
        }

        remove: Transition {
            NumberAnimation {
                property: "scale"
                from: 1
                to: 0
                duration: 150
            }
        }

        removeDisplaced: Transition {
            SequentialAnimation {
                PauseAnimation {
                    duration: 150
                }
                NumberAnimation {
                    property: "y"
                    duration: 200
                    easing.type: Easing.OutCubic
                }
            }
        }

        // displaced: Transition {
        //     NumberAnimation {
        //         property: "y"
        //         duration: 200
        //         easing.type: Easing.OutCubic
        //     }
        // }
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
