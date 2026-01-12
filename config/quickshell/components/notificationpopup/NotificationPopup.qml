import Quickshell.Services.Notifications
import Quickshell.Widgets
import Quickshell

import QtQuick.Layouts
import QtQuick

Rectangle {
  id: root
  color: "black"
  width: notifications.width
  border.color: "white"
  clip: true
  
  MouseArea {
    id: mArea
    anchors.top: parent.top
    anchors.left: parent.left
    anchors.topMargin: 8
    anchors.leftMargin: 8
    width: parent.width
    implicitHeight: Math.max(nImage.height, nTitle.height + nBody.height) + 16 + (modelData.actions.length ? 4 : 0)
    acceptedButtons: Qt.LeftButton | Qt.RightButton
    onClicked: (m) => {
      if (m.button === Qt.RightButton) {
          parent.rm(false)
      }
    }
          
      IconImage {
        id: nImage
        implicitSize: 48
        source: Quickshell.iconPath(modelData.appIcon)
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
  
  Timer { // DEBUG
    interval: 1
    running: true
    repeat: false
    onTriggered: print(`appIcon: '${modelData.appIcon}', image: '${modelData.image}'`)
  }
  
  Timer {
    interval: modelData.expireTimeout >= 0 ? modelData.expireTimeout : 3000
    running: true
    repeat: false
    onTriggered: rm(true)
  }
  
  function rm(ex) {
    nTitle.wrapMode = Text.NoWrap
    nBody.wrapMode = Text.NoWrap
    // exitAnim.onFinished = disimssed ? modelData.dismissed
    // modelData.dismiss()
    exitAnim.expired = ex
    exitAnim.start()
  }
      
  ParallelAnimation {
    readonly property var easing: Easing.OutCubic
    readonly property int duration: 300
    property bool expired
    id: exitAnim
    NumberAnimation {
      target: root
      property: "width"
      to: 0
      duration: exitAnim.duration
      easing.type: exitAnim.easing
    }
    NumberAnimation {
      target: root
      property: "x"
      to: root.width / 2
      duration: exitAnim.duration
      easing.type: exitAnim.easing
    }
    NumberAnimation {
      target: root
      property: "height"
      to: root.height
      duration: exitAnim.duration
    }
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
      property: "height"
      from: 0
      to: mArea.implicitHeight + nActions.implicitHeight
      duration: enterAnim.duration
      easing.type: enterAnim.easing
    }

    NumberAnimation {
      target: root
      property: "opacity"
      from: 0
      to: 1
      duration: enterAnim.duration
    }
  }
}
