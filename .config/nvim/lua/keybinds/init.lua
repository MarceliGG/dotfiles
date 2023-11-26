local telescope = require('telescope.builtin')
local bind = vim.keymap.set
local cmd = vim.cmd
vim.g.mapleader = " "
bind('n', '<leader>ff', telescope.find_files, {})
bind('n', '<leader>fg', telescope.live_grep, {})
bind('n', '<leader>fe', cmd.Ex, {})
