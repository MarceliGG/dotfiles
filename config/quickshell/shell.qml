//@ pragma UseQApplication
//@ pragma Env QS_NO_RELOAD_POPUP=1
import Quickshell
import QtQuick

import qs.modules

ShellRoot {
    Bar {}
    Notifications {}
    Osd {}
    Polkit {}
}
