require("tokyonight").setup {
  transparent = true
}
function ApplyColors()
  vim.cmd.colorscheme("tokyonight")
  vim.api.nvim_set_hl(0, "TelescopeNormal", { bg = "none" })
  vim.api.nvim_set_hl(0, "TelescopeBorder", { bg = "none", fg = "#5aa4aa" })
end

ApplyColors()
