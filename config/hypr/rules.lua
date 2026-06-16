-- Fullscreen ksnip
hl.window_rule({
  match = {
    class = "org.ksnip.ksnip",
    float = false
  },
  fullscreen = true
})

-- Smart border
hl.window_rule({
  match = {
    float = false,
    workspace = "w[tv1]"
  },
  border_size = 0
})
