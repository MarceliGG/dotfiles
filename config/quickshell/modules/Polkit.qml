// import Quickshell.Services.Polkit
import Quickshell.Wayland
import Quickshell

import QtQuick.Layouts
import QtQuick

import qs.services

PanelWindow {
    id: root

    visible: PolkitAgent.isActive

    anchors {
        top: true
        right: true
        left: true
        bottom: true
    }

    function cancel() {
        PolkitAgent.flow?.cancelAuthenticationRequest();
        input.text = "";
    }

    function submit() {
        PolkitAgent.flow?.submit(input.text);
        input.text = "";
    }

    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

    color: "#88000000"

    Rectangle {
        color: "#141418"
        radius: 8
        anchors.centerIn: parent
        implicitWidth: 400
        implicitHeight: col.implicitHeight + 32

        border {
            width: 2
            color: "#4698C0"
        }

        ColumnLayout {
            id: col

            anchors {
                fill: parent
                margins: 8
            }

            Text {
                Layout.fillWidth: true
                text: PolkitAgent.flow?.message ?? ""
                wrapMode: Text.Wrap
                color: "#ddd"
                font.family: "JetBrains Mono Nerd Font"
                font.pixelSize: 16
                font.bold: true
            }

            Text {
                Layout.fillWidth: true
                visible: text !== ""
                text: PolkitAgent.flow?.supplementaryMessage ?? ""
                wrapMode: Text.Wrap
                color: PolkitAgent.flow?.supplementaryIsError ? "#e53935" : "#aaa"
                font.family: "JetBrains Mono Nerd Font"
                font.pixelSize: 14
            }

            Text {
                Layout.fillWidth: true
                visible: PolkitAgent.flow?.failed === true
                text: "Failed"
                wrapMode: Text.Wrap
                color: "#e53935"
                font.family: "JetBrains Mono Nerd Font"
                font.pixelSize: 14
            }

            Rectangle {
                color: "#26262a"
                Layout.fillWidth: true
                implicitHeight: input.contentHeight + 8
                radius: 2

                TextInput {
                    id: input
                    verticalAlignment: TextInput.AlignVCenter
                    x: 4
                    y: 4
                    color: "#ddd"
                    font.pixelSize: 14
                    font.family: "JetBrains Mono Nerd Font"
                    selectionColor: "#4698C0"

                    echoMode: PolkitAgent.flow?.responseVisible ? TextInput.Normal : TextInput.Password

                    clip: true
                    focus: true

                    onAccepted: root.submit()

                    Keys.onEscapePressed: root.cancel()
                }
            }

            RowLayout {
                Rectangle {
                    color: cancelArea.pressed ? "#993344" : cancelArea.containsMouse ? "#892334" : "#993344"

                    radius: 2

                    Layout.fillWidth: true

                    implicitHeight: cancelLabel.implicitHeight + 8

                    MouseArea {
                        id: cancelArea
                        anchors.fill: parent
                        hoverEnabled: true
                        acceptedButtons: Qt.LeftButton
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.cancel()
                    }

                    Text {
                        id: cancelLabel
                        anchors.centerIn: parent
                        color: "#ddd"
                        font.pixelSize: 14
                        font.family: "JetBrains Mono Nerd Font"
                        text: "Cancel"
                    }
                }

                Rectangle {
                    color: submitArea.pressed ? "#4698C0" : submitArea.containsMouse ? "#367594" : "#4698C0"

                    radius: 2

                    Layout.fillWidth: true

                    implicitHeight: submitLabel.implicitHeight + 8

                    MouseArea {
                        id: submitArea
                        anchors.fill: parent
                        hoverEnabled: true
                        acceptedButtons: Qt.LeftButton
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.submit()
                    }

                    Text {
                        id: submitLabel
                        anchors.centerIn: parent
                        color: "#ddd"
                        font.pixelSize: 14
                        font.family: "JetBrains Mono Nerd Font"
                        text: "Submit"
                    }
                }
            }
        }
    }
}
