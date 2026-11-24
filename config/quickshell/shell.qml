//@ pragma UseQApplication
//@ pragma Env QS_NO_RELOAD_POPUP=1
import Quickshell
import QtQuick

import qs.modules
import qs.services

ShellRoot {
    Component.onCompleted: {
        OsdState;
        Audio;
        NotifServer;
        PolkitAgent;
    }

    Variants {
        model: Quickshell.screens.filter(s => s.model !== "").slice(0, 1)
        Scope {
            id: variantScope
            required property ShellScreen modelData

            Bar {
                screen: variantScope.modelData
            }
            Notifications {
                screen: variantScope.modelData
            }
            Osd {
                screen: variantScope.modelData
            }
            Polkit {
                screen: variantScope.modelData
            }
        }
    }
}
