import Quickshell.Widgets
import Quickshell

import qs.services

import QtQuick

Item {
  implicitWidth: text.width + image.width

  IconImage {
    id: image
    implicitSize: 19
    anchors.verticalCenter: parent.verticalCenter
    anchors.left: parent.left
    source: Quickshell.iconPath(Audio.getIcon())
  }

  Text {
    id: text

    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    
  
    color: "#ddd"
    font.pixelSize: 14
    font.family: fontF
    text: `${Audio.volume}%`
  }
}

