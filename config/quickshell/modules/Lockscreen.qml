import Quickshell.Services.UPower
import Quickshell.Services.Pam
import Quickshell.Hyprland
import Quickshell.Wayland
import Quickshell.Io
import Quickshell

import QtQuick

Scope {
    id: root

    property string buffer: ""
    property bool unlockInProgress: false
    property string error: ""

    WlSessionLock {
        id: lock
        locked: false

        WlSessionLockSurface {
            color: "black"

            MouseArea { // hide cursor
                anchors.fill: parent
                acceptedButtons: Qt.NoButton
                cursorShape: Qt.BlankCursor
            }

            Column {
                id: col
                anchors.centerIn: parent

                Text {
                    color: "#aaa"
                    font.pixelSize: 24
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: Qt.formatDateTime(sys_clock.date, "󰥔  hh:mm")
                }

                Text {
                    font.pixelSize: 20
                    anchors.horizontalCenter: parent.horizontalCenter
                    visible: UPower.displayDevice.isLaptopBattery
                    color: UPower.displayDevice.state === UPowerDeviceState.Charging ? "#5f3" : "#aaa"

                    function getIcon(pct) {
                        if (pct > 0.75)
                            return "󱊣";
                        if (pct > 0.50)
                            return "󱊢";
                        if (pct > 0.25)
                            return "󱊡";
                        return "󰂎";
                    }

                    text: `${getIcon(UPower.displayDevice.percentage)} ${Math.round(UPower.displayDevice.percentage * 100)}${UPower.displayDevice.state === UPowerDeviceState.Charging ? "" : "%"}`
                }
            }

            Text {
                anchors.top: col.bottom
                anchors.horizontalCenter: parent.horizontalCenter
                color: root.unlockInProgress ? "#ddd" : "#e53935"
                font.family: "JetBrains Mono Nerd Font"
                text: root.unlockInProgress ? "Unlocking..." : root.error
            }

            TextInput {
                id: input
                opacity: 0

                onTextEdited: root.buffer = text

                echoMode: TextInput.NoEcho

                clip: true
                focus: true

                onAccepted: root.submit()

                Connections {
                    target: root
                    function onBufferChanged() {
                        if (input.text !== root.buffer)
                            input.text = root.buffer;
                    }
                }

                Keys.onEscapePressed: root.buffer = ""
            }
        }
    }

    PamContext {
        id: pam

        onCompleted: result => {
            switch (result) {
            case PamResult.Success:
                root.error = "";
                lock.locked = false;
                break;
            case PamResult.Error:
                root.error = "Pam encountered an error";
                break;
            case PamResult.Failed:
                root.error = "Unlocking failed";
                break;
            case PamResult.MaxTries:
                root.error = "Max tries reached";
                break;
            }
            root.unlockInProgress = false;
        }

        onPamMessage: {
            if (root.unlockInProgress && this.responseRequired) {
                this.respond(root.buffer);
                root.buffer = "";
            }
        }
    }

    function submit() {
        if (unlockInProgress)
            return;
        pam.start();
        unlockInProgress = true;
    }

    IpcHandler {
        target: "lock"

        function engage(): void {
            lock.locked = true;
        }
    }
}
