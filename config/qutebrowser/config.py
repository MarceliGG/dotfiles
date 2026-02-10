config.load_autoconfig(False)

# KEYBINDS
config.bind("ge", "scroll-to-perc", mode="normal")
config.bind("ga", "tab-focus last", mode="normal")
config.bind("J", "tab-prev", mode="normal")
config.bind("K", "tab-next", mode="normal")
config.unbind("G", mode="normal")
config.bind("gJ", "tab-move -", mode="normal")
config.bind("gK", "tab-move +", mode="normal")

config.bind("<space>s", "config-source", mode="normal")
config.bind("<space>r", "restart", mode="normal")
config.bind("<space>g", "spawn --userscript ~/.config/qutebrowser/scripts/reload-gs.sh", mode="normal")
config.bind("<space>u", "spawn --userscript ~/.config/qutebrowser/scripts/bitwarden.sh username {url:host}", mode="normal")
config.bind("<space>p", "spawn --userscript ~/.config/qutebrowser/scripts/bitwarden.sh password {url:host}", mode="normal")
config.bind("<space>b", "spawn --userscript ~/.config/qutebrowser/scripts/bitwarden.sh both {url:host}", mode="normal")

config.bind("<Ctrl-o>", "cmd-set-text :open {url}", mode="normal")
config.bind("<F12>", "devtools", mode="normal")


# speed up scrolling
# config.bind("k", "cmd-repeat 3 scroll up")
# config.bind("j", "cmd-repeat 3 scroll down")

# CONFIG
c.scrolling.smooth = True
c.colors.webpage.preferred_color_scheme = "dark"
c.keyhint.delay = 0

c.auto_save.session = True

c.content.blocking.enabled = True
c.content.blocking.method = "adblock"

# tabs
c.tabs.position = "top"
c.tabs.last_close = "startpage"
c.tabs.show = "multiple"
c.tabs.title.alignment = "left"

# search egines and newtab
c.url.searchengines = {
    "DEFAULT": "https://eu.startpage.com/search?q={}",
    "@a": "https://wiki.archlinux.org/index.php?search={}"
}
c.url.default_page = "https://eu.startpage.com/"
c.url.start_pages = c.url.default_page

# COLORS
# tranparent browser ui background (will be qt theme)
c.colors.tabs.bar.bg = "transparent"
c.colors.tabs.odd.bg = "transparent"
c.colors.tabs.even.bg = "transparent"
c.colors.statusbar.normal.bg = "transparent"
# c.colors.webpage.bg = "transparent"
c.colors.tabs.selected.odd.bg = "#08508a"
c.colors.tabs.selected.even.bg = "#08508a"
