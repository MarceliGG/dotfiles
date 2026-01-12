pragma Singleton

import Quickshell.Services.Pipewire
import Quickshell

Singleton {
  id: root

  readonly property PwNode sink: Pipewire.defaultAudioSink


  function getIcon() {
    return sink.audio.muted ? "audio-volume-muted-symbolic" : volume > 66 ? "audio-volume-high-symbolic" : volume > 33 ? "audio-volume-medium-symbolic" : "audio-volume-low-symbolic"
  }

  function incUp() {
    sink.audio.volume = Math.min(sink.audio.volume + 0.02, 1)
  }

  function incDown() {
    sink.audio.volume -= 0.02
  }

  function toggleMute() {
    return sink.audio.muted = !sink.audio.muted
  }

  readonly property real volume: Math.round(sink?.audio?.volume*100) ?? 0

  PwObjectTracker {
    objects: [sink]
  }
}
