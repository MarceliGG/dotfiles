pragma Singleton

import Quickshell.Services.Pipewire
import Quickshell

Singleton {
    id: root

    readonly property PwNode sink: Pipewire.defaultAudioSink

    function getIcon() {
        if (muted)
            return " ";
        if (volume > 75)
            return " ";
        if (volume > 50)
            return " ";
        if (volume > 25)
            return " ";
        return " ";
    }

    function incUp() {
        if (!sink?.audio) return;
        sink.audio.volume = Math.min(sink.audio.volume + 0.02, 1);
    }

    function incDown() {
        if (!sink?.audio) return;
        sink.audio.volume -= 0.02;
    }

    function toggleMute() {
        if (!sink?.audio) return;
        return sink.audio.muted = !sink.audio.muted;
    }

    readonly property real volume: Math.round(sink?.audio?.volume * 100)
    readonly property bool muted: sink?.audio?.muted ?? false

    PwObjectTracker {
        objects: [sink]
    }
}
