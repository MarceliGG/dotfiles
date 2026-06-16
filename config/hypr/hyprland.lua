require("keybinds")
require("animations")
require("startup")
require("rules")
require("layouts")

hl.config({
  general = {
    border_size = 1,
    gaps_in = 0,
    gaps_out = 0,

    col = {
      active_border = { colors = { "rgba(4499c2ff)", "rgba(049450ff)" }, angle = 45 },
      inactive_border = "rgba(222222ff)"
    },

    layout = "master"
  },

  decoration = {
    rounding = 0,

    blur = {
      enabled = false,
      size = 3,
      passes = 2,
      xray = true,
      noise = 0,
    },

    shadow = {
      enabled = false,
    }
  },

  input = {
    kb_layout = "pl",
    kb_options = "caps:escape,altwin:swap_lalt_lwin",
    numlock_by_default = true,
    accel_profile = "flat",
    follow_mouse = 1,

    touchpad = {
      natural_scroll = true,
      disable_while_typing = false,
    }
  },

  master = {
    mfact = 0.5
  }
})

hl.monitor({
  output = "eDP-1",
  mode = "1920x1080@60",
})

hl.gesture({ fingers = 3, direction = "vertical", action = "workspace" })


hl.bind("SUPER + M", hl.dsp.window.move({ workspace = "special:minimize", follow = false }))
