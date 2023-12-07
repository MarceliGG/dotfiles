require("plugins")
require("keybinds")
require("colors")

local opt = vim.opt

opt.nu = true
opt.relativenumber = true

opt.tabstop = 4
opt.softtabstop = 4
opt.shiftwidth = 4
opt.expandtab = true

opt.smartindent = true

opt.backup = false
opt.swapfile = false

opt.scrolloff = 8

opt.signcolumn = "no"
