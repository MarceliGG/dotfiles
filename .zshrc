# Autocomlition
autoload -Uz compinit
compinit
zstyle ':completion:*' menu select

zsh_conf_dir=~/.config/zsh

# Syntax highlighting
source $zsh_conf_dir/fast-syntax-highlighting/fast-syntax-highlighting.plugin.zsh

# History
HISTFILE=~/.config/zsh/history
SAVEHIST=1000
HISTSIZE=1000
source $zsh_conf_dir/zsh-history-substring-search/zsh-history-substring-search.zsh
bindkey '^[[A' history-substring-search-up
bindkey '^[[B' history-substring-search-down

# Aliases
alias ls='ls -A --color=auto'
alias lsl='ls -Al --color=auto'
alias v='nvim'
alias py='python'
alias mv='mv -i'
alias cp='cp -i'
alias rm='trash'
alias remove='rm'
alias git-dotfiles="git --git-dir=$HOME/dotfiles --work-tree=$HOME"

eval "$(starship init zsh)"
