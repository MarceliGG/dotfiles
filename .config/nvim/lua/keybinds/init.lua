local telescope = require('telescope.builtin')
local bind = vim.keymap.set

vim.g.mapleader = " "
bind('n', '<leader>ff', telescope.find_files, {})
bind('n', '<leader>ft', ':Telescope file_browser<Enter>', {})
bind('n', '<leader>fg', telescope.live_grep, {})
bind('n', '<leader>fe', vim.cmd.Ex, {})

bind('n', '<leader>il', ':LspInfo<Enter>', {})
bind('n', '<leader>in', ':NullLsInfo<Enter>', {})
bind('n', '<leader>im', ':Mason<Enter>', {})
bind('n', '<leader>ip', ':PackerStatus<Enter>', {})
