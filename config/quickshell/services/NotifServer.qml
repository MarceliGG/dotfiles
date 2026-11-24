pragma Singleton

import Quickshell.Services.Notifications

import Quickshell

import QtQml

Singleton {
    readonly property alias trackedNotifications: server.trackedNotifications

    NotificationServer {
        id: server
        onNotification: notif => {
            notif.tracked = true;
        }
        actionsSupported: true
        imageSupported: true
    }

    Instantiator {
        model: server.trackedNotifications

        Timer {
            interval: modelData?.expireTimeout > 0 ? modelData?.expireTimeout : 5000
            running: modelData?.urgency !== NotificationUrgency.Critical
            repeat: false
            onTriggered: modelData.expire()
        }
    }
}
