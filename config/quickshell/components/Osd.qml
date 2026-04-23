import Quickshell.Wayland
import Quickshell.Widgets
import Quickshell.Io
import Quickshell

import qs.services

import QtQuick.Controls
import QtQuick.Shapes
import QtQuick

PanelWindow {
  visible: false
  id: osd
  color: "transparent"

  anchors {
    bottom: true
    // top: true
    // right: true
    left: true
  }

  margins {
    // bottom: 12
    left: 34
  }

  WlrLayershell.layer: WlrLayer.Overlay
  exclusionMode: ExclusionMode.Ignore
  implicitWidth: 500
  implicitHeight: 105
  mask: Region {}

  Item {
    id: item
    width: parent.width
    // anchors.bottomMargin: 12
    anchors.bottom: osd.bottom

    NumberAnimation {
      id: exitAnim

      target: item
      property: "y"
      to: 105
      duration: 600
      easing.type: Easing.OutCubic

      onFinished: {
        osd.visible = false
      }
    }

    NumberAnimation {
      id: enterAnim

      target: item
      property: "y"
      from: 105
      to: 0
      duration: 200
      easing.type: Easing.OutCubic
    }

    Shape {
      id: progress
      anchors.left: circle.right
      anchors.top: circle.top
      anchors.topMargin: 50
      anchors.leftMargin: -12
      width: 350
      height: 32

      property int value: 0

      Behavior on value {
        NumberAnimation {
          duration: 50
          easing.type: Easing.Linear
        }
      }

      ShapePath {
        fillColor: "#121522"
        strokeColor: "#223399"
        strokeWidth: 3

        PathLine { x: progress.width; y: 0 }
        PathLine { x: progress.width-20; y: progress.height }
        PathLine { x: 0; y: progress.height }
        PathLine { x: 0; y: 0 }
      }

      ShapePath {
        fillColor: "#00dfff"
        strokeWidth: 0

        startY: 1

        PathLine { x: progress.width * (progress.value/100)-2; y: 1 }
        PathLine { x: progress.width * (progress.value/100)-20; y: progress.height - 2 }
        PathLine { x: 0; y: progress.height - 2 }
        PathLine { x: 0; y: 1 }
      }
    }

    Shape {
      id: labelBg
      anchors.left: circle.right
      anchors.leftMargin: -13
      anchors.bottom: circle.bottom
      anchors.bottomMargin: 50
      width: 150
      height: 32

      ShapePath {
        strokeColor: "#223399"
        fillColor: "#121522"
        strokeWidth: 3

        PathLine { x: labelBg.width-20; y: 0 }
        PathLine { x: labelBg.width; y: labelBg.height }
        PathLine { x: 0; y: labelBg.height }
        PathLine { x: 0; y: 0 }
      }
    
      Text {
        font.pixelSize: 20
        font.family: fontF
        color: "white"
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.verticalCenter: parent.verticalCenter
        text: "Volume"
      }
    }
  
    Rectangle {
      id: circle
      width: 100
      height: width
      radius: width / 2
      color: "#121522"
      border.color: "#223399"
      border.width: 5

      Text {
        id: perc
        font.pixelSize: 32
        font.family: fontF
        color: "white"
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.verticalCenter: parent.verticalCenter
      }
    }
  }

  Timer {
    id: hideTimer
    interval: 1000
    repeat: false
    running: false
    onTriggered: {
      exitAnim.start()
    }
  }

  function displayVolume(isMuted, vol) {
    hideTimer.restart()
    progress.value = vol
    perc.text = isMuted ? "Mute" : `${vol}%`
    if (!osd.visible) {
      osd.visible = true
      enterAnim.start()
    }
  }

  IpcHandler {
    target: "osd"
    function volUp() {
      Audio.incUp()
      displayVolume(Audio.muted, Audio.volume)
    }
    function volDown() {
      Audio.incDown()
      displayVolume(Audio.muted, Audio.volume)
    }

    function toggleMute() {
      const m = Audio.toggleMute()
      displayVolume(m, Audio.volume)
    }
  }
}

