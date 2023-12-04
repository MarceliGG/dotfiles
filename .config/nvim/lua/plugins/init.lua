-- Configs
require('plugins.others')
require('plugins.lsp')
require('plugins.treesitter')
require('plugins.telescope')
require('plugins.lualine')
-- This file can be loaded by calling `lua require('plugins')` from your init.vim


-- Only required if you have packer configured as `opt`
vim.cmd [[packadd packer.nvim]]

return require('packer').startup(function(use)
  -- Packer can manage itself
  use 'wbthomason/packer.nvim'

  -- Telescope
  use {
    'nvim-telescope/telescope.nvim', tag = '0.1.4',
    requires = { { 'nvim-lua/plenary.nvim' } }
  }

  use 'nvim-telescope/telescope-file-browser.nvim'

  use 'nvim-tree/nvim-web-devicons' -- Icons for telescope

  -- Treesitter
  use {
    'nvim-treesitter/nvim-treesitter',
    run = ':TSUpdate'
  }

  -- Autocompletion
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

  use 'hrsh7th/cmp-path'

  use 'rafamadriz/friendly-snippets'

  use 'saadparwaiz1/cmp_luasnip'

  use 'hrsh7th/cmp-buffer'

  -- Formating
  use 'jose-elias-alvarez/null-ls.nvim'

  -- Autoclose brackets, quotes, etc.
  use 'm4xshen/autoclose.nvim'

  -- Colorscheme
  use 'folke/tokyonight.nvim'

  -- Status line
  use 'nvim-lualine/lualine.nvim'

  -- Togglable comments
  use 'numToStr/Comment.nvim'
end)
