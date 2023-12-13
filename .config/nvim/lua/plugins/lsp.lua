local lsp_zero = require('lsp-zero')

require('mason').setup({
  ensure_installed = { 'autopep8' }
})
require('mason-lspconfig').setup({
  ensure_installed = { 'lua_ls', 'rust_analyzer', 'pyright', 'eslint' },
})

lsp_zero.on_attach(function(client, bufnr)
  local opts = { buffer = bufnr }
  local bind = vim.keymap.set
  bind("n", "gd", function() vim.lsp.buf.definition() end, opts)
  bind("n", "<leader>r", function() vim.lsp.buf.rename() end, opts)
  bind("n", "<leader>c", function() vim.lsp.buf.format() end, opts)
end)

lsp_zero.setup_servers({ 'lua_ls', 'rust_analyzer', 'biome', 'pyright', 'bashls', 'eslint' })
require'lspconfig'.html.setup{
    filetypes = {
        "html",
        "javascriptreact"
    }
}

local cmp = require('cmp')
cmp.setup({
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

require("luasnip.loaders.from_vscode").lazy_load()


local null_ls = require("null-ls")

null_ls.setup({
  sources = {
    null_ls.builtins.formatting.autopep8,
    null_ls.builtins.formatting.prettier,
},
})
