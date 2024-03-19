require('mason').setup({
  ensure_installed = { 'autopep8', 'lua_ls', 'rust_analyzer', 'pyright', 'eslint', 'emmet_language_server' }
})


local on_attach = function(client, buffer)
  local opts = { buffer = buffer }
  local bind = vim.keymap.set
  bind("n", "gd", vim.lsp.buf.definition, opts)
  bind("n", "<leader>r", vim.lsp.buf.rename, opts)
  bind("n", "<leader>c", vim.lsp.buf.format, opts)
  bind("n", "<leader> ", vim.lsp.buf.hover, opts)
end

local lspconfig = require 'lspconfig'

lspconfig.cssls.setup {
  on_attach = on_attach,
}
--[[ lspconfig.html.setup{
  filetypes = {
    "html",
    "javascriptreact",
    "javascript",
    "vue"
  },
  on_attach = on_attach,
} ]]
lspconfig.lua_ls.setup {
  on_attach = on_attach,
}
lspconfig.rust_analyzer.setup {
  on_attach = on_attach,
}
--[[ lspconfig.biome.setup {
  on_attach = on_attach,
} ]]
lspconfig.pyright.setup {
  on_attach = on_attach,
}
lspconfig.bashls.setup {
  on_attach = on_attach,
}
--[[ lspconfig.eslint.setup {
  on_attach = on_attach,
} ]]
lspconfig.emmet_language_server.setup {
  on_attach = on_attach,
}
lspconfig.tailwindcss.setup {
  on_attach = on_attach,
}

local cmp = require('cmp')
cmp.setup({
  snippet = {
    -- REQUIRED - you must specify a snippet engine
    expand = function(args)
      -- vim.fn["vsnip#anonymous"](args.body) -- For `vsnip` users.
      require('luasnip').lsp_expand(args.body) -- For `luasnip` users.
      -- require('snippy').expand_snippet(args.body) -- For `snippy` users.
      -- vim.fn["UltiSnips#Anon"](args.body) -- For `ultisnips` users.
    end,
  },
  mapping = {
    ['<C-Enter>'] = cmp.mapping.confirm({ select = true }),
    ['<Tab>'] = cmp.mapping.select_next_item(),
    ['<down>'] = cmp.mapping.select_next_item(),
    ['<S-Tab>'] = cmp.mapping.select_prev_item(),
    ['<up>'] = cmp.mapping.select_prev_item(),
  },
  sources = cmp.config.sources({
    { name = 'nvim_lsp' },
    { name = 'buffer' },
    { name = 'path' },
    { name = 'luasnip' },
  })
})

local cmp_autopairs = require('nvim-autopairs.completion.cmp')
cmp.event:on(
  'confirm_done',
  cmp_autopairs.on_confirm_done()
)

cmp.setup.cmdline({ '/', '?' }, {
  mapping = cmp.mapping.preset.cmdline(),
  sources = {
    { name = 'buffer' }
  }
})

cmp.setup.cmdline(':', {
  mapping = cmp.mapping.preset.cmdline(),
  sources = cmp.config.sources({
    { name = 'path' }
  }, {
    { name = 'cmdline' }
  })
})

require("luasnip.loaders.from_vscode").lazy_load()


local null_ls = require("null-ls")
local helpers = require("null-ls.helpers")
local FORMATTING = require("null-ls.methods").internal.FORMATTING
require("null-ls").register({
  --your custom sources go here
  helpers.make_builtin({
    name = "autopep8",
    method = FORMATTING,
    filetypes = { "python" },
    generator_opts = {
      command = "/home/marcel/.local/share/nvim/mason/bin/autopep8",
      args = {'--max-line-length', '120', '-'},       -- put any required arguments in this table
      to_stdin = true, -- instructs the command to ingest the file from STDIN (i.e. run the currently open buffer through the linter/formatter)
    },
    factory = helpers.formatter_factory,
  }),
  helpers.make_builtin({
    name = "biome",
    method = FORMATTING,
    filetypes = { "javascript", "javascriptreact" },
    generator_opts = {
      command = '/home/marcel/.local/share/nvim/mason/bin/biome',
      args = {'format', '--stdin-file-path', '$FILENAME'},       -- put any required arguments in this table
      to_stdin = true, -- instructs the command to ingest the file from STDIN (i.e. run the currently open buffer through the linter/formatter)
    },
    factory = helpers.formatter_factory,
  })
})

null_ls.setup({
  sources = {
    null_ls.builtins.formatting.stylelint,
  },
  debug = true,
})
