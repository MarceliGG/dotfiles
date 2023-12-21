-- Autoclose brackets, quotes, etc.
require('nvim-autopairs').setup()

-- Togglable comments
require("Comment").setup {
  toggler = {
    line = ' /',
    block = ' ,'
  },
  opleader = {
    line = ' /',
    block = ' ,',
  },
  mappings = {
    basic = true,
    extra = false,
  },
}
