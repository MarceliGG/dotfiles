require("plugins")
require("keybinds")
require("plugins.lsp")
require("plugins.treesitter")
require("plugins.telescope")
require("colors")

local opt = vim.opt

opt.nu = true
opt.relativenumber = true

opt.tabstop = 2
opt.softtabstop = 2
opt.shiftwidth = 2
opt.expandtab = true

opt.smartindent = true

opt.backup = false
opt.swapfile = false

opt.scrolloff = 6

opt.signcolumn = "no"
