import Quickshell.Services.Notifications
import Quickshell.Widgets
import Quickshell

import QtQuick.Layouts
import QtQuick

Rectangle {
  id: root
  color: "black"
  height: mArea.implicitHeight + nActions.implicitHeight
  width: notifications.width
  clip: true
  radius: 8
  
  MouseArea {
    id: mArea
    anchors.top: parent.top
    anchors.left: parent.left
    anchors.topMargin: 8
    anchors.leftMargin: 8
    width: parent.width
    implicitHeight: Math.max(nImage.height, nTitle.height + nBody.height) + 16 + (modelData.actions.length ? 4 : 0)
    acceptedButtons: Qt.RightButton
    onClicked: (m) => {
      parent.rm(false)
    }
          
    IconImage {
      id: nImage
      implicitSize: 48
      source: Quickshell.iconPath(modelData.appIcon || "dialog-information")
    }
    
    Text {
      anchors.left: nImage.right
      anchors.leftMargin: 4
      anchors.right: parent.right
      anchors.rightMargin: 10
      wrapMode: Text.WrapAtWordBoundaryOrAnywhere
      id: nTitle
      text: modelData.summary
      font.pixelSize: 16
      font.family: fontF
      font.bold: true
      color: "white"
    }
    
    Text {
      id: nBody
      anchors.leftMargin: 4
      anchors.left: nImage.right
      anchors.top: nTitle.bottom
      anchors.right: parent.right
      anchors.rightMargin: 10
      text: modelData.body
      wrapMode: Text.WrapAtWordBoundaryOrAnywhere
      font.pixelSize: 14
      font.family: fontF
      color: "white"
    }
  }
  
  ListView {
    id: nActions
    spacing: 4
    anchors.bottom: parent.bottom
    anchors.left: parent.left
    anchors.bottomMargin: 8
    anchors.leftMargin: 8
    implicitHeight: contentHeight
    model: modelData.actions
    delegate: Rectangle {
      width: root.width - 16
      height: 20
      color: "#484852"
      radius: 4

      Text {
        anchors.centerIn: parent
        text: modelData.text
        font.pixelSize: 14
        font.family: fontF
        color: "white"
      }

      MouseArea {
        anchors.fill: parent
        onClicked: modelData.invoke()
      }
    }
  }
  
  Timer {
    interval: modelData.expireTimeout >= 0 ? modelData.expireTimeout : 5000
    running: true
    repeat: false
    onTriggered: rm(true)
  }
  
  function rm(ex) {
    exitAnim.expired = ex
    exitAnim.start()
  }
      
  NumberAnimation {
    property bool expired
    id: exitAnim

    target: root
    property: "x"
    to: 300
    duration: 300
    easing.type: Easing.OutCubic

    onFinished: {
      if(expired) modelData.expire()
      else modelData.dismiss()
    }
  }

  Component.onCompleted: {
      enterAnim.start()
  }

  ParallelAnimation {
    readonly property var easing: Easing.OutCubic
    readonly property int duration: 300
    id: enterAnim

    NumberAnimation {
      target: root
      property: "x"
      from: notifications.width / 2
      to: 0
      duration: enterAnim.duration
      easing.type: enterAnim.easing
    }

    NumberAnimation {
      target: root
      property: "rotation"
      from: 90
      to: 0
      duration: enterAnim.duration
      easing.type: enterAnim.easing
    }

    NumberAnimation {
      target: root
      property: "scale"
      from: 0
      to: 1
      duration: enterAnim.duration
    }
  }
}
