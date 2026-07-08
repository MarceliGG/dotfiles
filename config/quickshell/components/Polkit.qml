import Quickshell
import Quickshell.Services.Polkit 

import QtQuick
import QtQuick.Controls

Item {
    PolkitAgent {
        property var win
        id: agent
        onIsActiveChanged: {
            if(isActive) {
                win = comp.createObject()
            } else {
                win.destroy()
            }
        }
    }

    Component {
        id: comp

        FloatingWindow {
            id: win
            color: "black"
            maximumSize: "520x200"
            minimumSize: maximumSize

            onClosed: {
                agent.flow.cancelAuthenticationRequest()
            }


            Text {
                anchors.top: parent.top
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.topMargin: 4
                anchors.leftMargin: 8
                anchors.rightMargin: 8
                id: message
                font.pixelSize: 20
                width: 200
                color: "white"
                wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                text: agent.flow?.message ?? ""
            }

            Text {
                id: prompt
                anchors.top: message.bottom
                anchors.left: message.left
                anchors.right: message.right
                anchors.topMargin: 8
                color: "white"
                text: `${agent.flow?.inputPrompt ?? ""} ${agent.flow?.failed ? "(failed)" : ""}`
            }

            TextField {
                id: field
                anchors.top: prompt.bottom
                anchors.left: prompt.left
                anchors.right: prompt.right
                anchors.topMargin: 8
                echoMode: agent.flow?.responseVisible ? TextInput.Normal : TextInput.Password
                focus: true
                color: "white"
                onAccepted: {
                    agent.flow.submit(text)
                }
                Keys.onEscapePressed: {
                    agent.flow.cancelAuthenticationRequest()
                }
            }

            Text {
                anchors.top: field.bottom
                anchors.left: field.left
                anchors.right: field.right
                anchors.topMargin: 8
                color: "white"
                wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                text: agent.flow?.supplementaryMessage ?? ""
            }

            Button {
                anchors.left: parent.left
                anchors.bottom: parent.bottom
                anchors.leftMargin: 8
                anchors.bottomMargin: 8
                text: "Cancel"
                onClicked: {
                    agent.flow.cancelAuthenticationRequest()
                }
            }

            Button {
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                anchors.rightMargin: 8
                anchors.bottomMargin: 8
                text: "Submit"
                onClicked: {
                    agent.flow.submit(field.text)
                }
            }
        }
    }
}
