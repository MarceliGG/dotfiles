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
  use 'hrsh7th/cmp-nvim-lsp'
  use 'hrsh7th/cmp-cmdline'
  use 'williamboman/mason.nvim'
  use 'L3MON4D3/LuaSnip'
  use 'hrsh7th/nvim-cmp'
  use 'neovim/nvim-lspconfig'
  use 'hrsh7th/cmp-path'
  use 'rafamadriz/friendly-snippets'
  use 'saadparwaiz1/cmp_luasnip'
  use 'hrsh7th/cmp-buffer'

  -- Formating
  use 'jose-elias-alvarez/null-ls.nvim'

  -- Autoclose brackets, quotes, etc.
  use 'windwp/nvim-autopairs'

  -- Colorscheme
  use 'folke/tokyonight.nvim'

  -- Status line
  use 'nvim-lualine/lualine.nvim'

  -- Togglable comments
  use 'numToStr/Comment.nvim'
end)
