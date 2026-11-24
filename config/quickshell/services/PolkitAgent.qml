pragma Singleton

import Quickshell.Services.Polkit
import Quickshell

import QtQml

Singleton {
    readonly property alias flow: agent.flow
    readonly property alias isActive: agent.isActive

    PolkitAgent {
        id: agent
    }
}

