require('mason').setup({
  ensure_installed = { 'autopep8','lua_ls', 'rust_analyzer', 'pyright', 'eslint', 'emmet_language_server' }
})


local on_attach = function(client, buffer)
  local opts = { buffer = buffer }
  local bind = vim.keymap.set
  bind("n", "gd", function() vim.lsp.buf.definition() end, opts)
  bind("n", "<leader>r", function() vim.lsp.buf.rename() end, opts)
  bind("n", "<leader>c", function() vim.lsp.buf.format() end, opts)
end

local lspconfig = require'lspconfig'

lspconfig.html.setup{
  filetypes = {
    "html",
    "javascriptreact"
  },
  on_attach = on_attach,
}
lspconfig.lua_ls.setup{
  on_attach = on_attach,
}
lspconfig.rust_analyzer.setup{
  on_attach = on_attach,
}
lspconfig.biome.setup{
  on_attach = on_attach,
}
lspconfig.pyright.setup{
  on_attach = on_attach,
}
lspconfig.bashls.setup{
  on_attach = on_attach,
}
lspconfig.eslint.setup{
  on_attach = on_attach,
}
lspconfig.emmet_language_server.setup{
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

null_ls.setup({
  sources = {
    null_ls.builtins.formatting.autopep8,
    null_ls.builtins.formatting.stylelint,
  },
})
