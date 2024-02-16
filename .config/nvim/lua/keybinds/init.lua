local telescope = require('telescope.builtin')
local bind = vim.keymap.set

vim.g.mapleader = " "

bind('n', '<leader>ff', telescope.find_files, {})
bind('n', '<leader>ft', ':Telescope file_browser path=%:p:h select_buffer=true<Enter><Esc>', {})
bind('n', '<leader>fg', telescope.live_grep, {})
bind('n', '<leader>fe', vim.cmd.Ex, {})
bind('n', '<leader>fb', telescope.buffers, {})

bind('n', '<leader>il', ':LspInfo<Enter>', {})
bind('n', '<leader>in', ':NullLsInfo<Enter>', {})
bind('n', '<leader>im', ':Mason<Enter>', {})
bind('n', '<leader>ip', ':PackerStatus<Enter>', {})
bind('n', '<leader>ic', ':CmpStatus<Enter>', {})

bind('n', 'Q', vim.cmd.q, {})

-- Save on ctrl+s
bind('n', '<C-s>', vim.cmd.w)
bind('i', '<C-s>', vim.cmd.w)
bind('v', '<C-s>', vim.cmd.w)
