//@ pragma UseQApplication
//@ pragma Env QS_NO_RELOAD_POPUP=1
import Quickshell
import QtQuick

import qs.components

ShellRoot {
  Connections {
    target: Quickshell
    function onScreensChanged() {
      if (Quickshell.screens[0].name === "")
        t.stop()
      else
        t.restart()
    }
  }

  Timer {
    id: t
    interval: 1000
    running: false
    repeat: false
    onTriggered: Quickshell.reload(false)
  }

  Bar {}
  Notifications {}
  Osd {}
  Polkit {}
}
