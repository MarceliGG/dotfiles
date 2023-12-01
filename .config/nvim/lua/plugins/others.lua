require("autoclose").setup()

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
