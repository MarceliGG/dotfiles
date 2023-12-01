-- This file can be loaded by calling `lua require('plugins')` from your init.vim

-- Only required if you have packer configured as `opt`
vim.cmd [[packadd packer.nvim]]

return require('packer').startup(function(use)
  -- Packer can manage itself
  use 'wbthomason/packer.nvim'

  use {
    'nvim-telescope/telescope.nvim', tag = '0.1.4',
    requires = { { 'nvim-lua/plenary.nvim' } }
  }

  use(
    'nvim-treesitter/nvim-treesitter',
    { run = ':TSUpdate' }
  )

  use {
    'VonHeikemen/lsp-zero.nvim',
    branch = 'v3.x',
    requires = {
      --- Uncomment these if you want to manage LSP servers from neovim
      { 'williamboman/mason.nvim' },
      { 'williamboman/mason-lspconfig.nvim' },

      -- LSP Support
      { 'neovim/nvim-lspconfig' },
      -- Autocompletion
      { 'hrsh7th/nvim-cmp' },
      { 'hrsh7th/cmp-nvim-lsp' },
      { 'L3MON4D3/LuaSnip' }
    }
  }
  use { "folke/tokyonight.nvim" }

  use({
    "L3MON4D3/LuaSnip",
    -- follow latest release.
    tag = "v2.*", -- Replace <CurrentMajor> by the latest released major (first number of latest release)
    -- install jsregexp (optional!:).
    run = "make install_jsregexp",
  })

  use { "hrsh7th/cmp-path" }

  use { "rafamadriz/friendly-snippets" }

  use { 'saadparwaiz1/cmp_luasnip' }

  use "nvim-telescope/telescope-file-browser.nvim"

  use "jose-elias-alvarez/null-ls.nvim"
end)
