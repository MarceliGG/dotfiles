//@ pragma UseQApplication
//@ pragma Env QS_NO_RELOAD_POPUP=1
import Quickshell

import qs.components

ShellRoot {
  Bar {}
  Notifications {}
  Osd {}
  Polkit {}
}
