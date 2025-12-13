config.load_autoconfig(False)

# KEYBINDS
config.bind("ge", "scroll-to-perc", mode="normal")
config.bind("ga", "tab-focus last", mode="normal")
config.bind("J", "tab-prev", mode="normal")
config.bind("K", "tab-next", mode="normal")
config.unbind("G", mode="normal")

config.bind("<Ctrl-space>s", "config-source", mode="normal")
config.bind("<Ctrl-space>r", "restart", mode="normal")
config.bind("<Ctrl-space>u", "spawn --userscript /home/marcel/.config/qutebrowser/scripts/bitwarden.sh username {url:host}", mode="normal")

config.bind("<Ctrl-o>", "cmd-set-text :open {url}", mode="normal")
config.bind("<F12>", "devtools", mode="normal")


# speed up scrolling
config.bind("k", "cmd-repeat 3 scroll up")
config.bind("j", "cmd-repeat 3 scroll down")

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
c.url.searchengines = {"DEFAULT": "https://www.startpage.com/search?q={}"}
c.url.default_page = "~/.config/qutebrowser/newtab.html"
c.url.start_pages = c.url.default_page

# COLORS
# tranparent browser ui background (will be qt theme)
c.colors.tabs.bar.bg = "transparent"
c.colors.tabs.odd.bg = "transparent"
c.colors.tabs.even.bg = "transparent"
c.colors.statusbar.normal.bg = "transparent"
c.colors.webpage.bg = "transparent"
