import Quickshell.Wayland
import Quickshell.Widgets
import Quickshell.Io
import Quickshell

import qs.services

import QtQuick.Controls
import QtQuick

PanelWindow {
  visible: false
  id: osd
  color: "transparent"

  WlrLayershell.layer: WlrLayer.Overlay
  exclusionMode: ExclusionMode.Ignore
  implicitWidth: 200
  implicitHeight: 216
  mask: Region {}
  
  ClippingRectangle {
    // color: "#ee121212"
    color: "black"
    anchors.fill: parent
    radius: 16

    Rectangle {
      visible: false
      id: progress
      anchors.bottom: parent.bottom
      property int value: 0
      height: parent.height * (value / 100)
      color: "#112"
      width: parent.width
      radius: parent.radius
    }
  }
  
  IconImage {
    id: image
    anchors.topMargin: 16
    anchors.top: parent.top
    anchors.horizontalCenter: parent.horizontalCenter
    implicitSize: 160
  }

  // Rectangle {
  //   id: progress
  //   property int value: 0
  //   anchors.centerIn: text
  //   color: "#222"
  //   width: 180
  //   height: 20
  //   radius: 8

  //   Rectangle {
  //     height: parent.height
  //     color: "#1343aa"
  //     width: parent.width * (parent.value / 100)
  //     radius: parent.radius
  //   }
  // }
  
  Text {
    id: text
    anchors.horizontalCenter: parent.horizontalCenter
    font.pixelSize: 16
    font.family: fontF
    text: "tmp"    
    color: "white"
    anchors.bottom: parent.bottom
    anchors.bottomMargin: 8
  }

  Timer {
    id: hide
    interval: 1000
    repeat: false
    running: false
    onTriggered: { osd.visible = false }
  }

  function display(icon, label, prog) {
    hide.restart()

    if (prog !== undefined) {
      progress.value = prog
      progress.visible = true
    } else progress.visible = false

    text.text = label
    image.source = Quickshell.iconPath(icon)

    osd.visible = true
  }

  IpcHandler {
    target: "osd"
    function volUp() {
      Audio.incUp()
      display(Audio.getIcon(), `Volume: ${Audio.volume}%`, Audio.volume)
    }
    function volDown() {
      Audio.incDown()
      display(Audio.getIcon(), `Volume: ${Audio.volume}%`, Audio.volume)
    }

    function toggleMute() {
      const m = Audio.toggleMute()
      display(Audio.getIcon(), m ? "Audio Muted" : `Volume: ${Audio.volume}%`, m ? undefined : Audio.volume)
    }
  }
}

