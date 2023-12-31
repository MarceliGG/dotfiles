zsh_conf_dir=~/.config/zsh

# Autocomlition
source $zsh_conf_dir/zsh-autocomplete/zsh-autocomplete.plugin.zsh
autoload -Uz compinit
compinit

zstyle ':autocomplete:*complete*:*' insert-unambiguous yes

bindkey '\t' menu-select "$terminfo[kcbt]" menu-select
bindkey -M menuselect '\t' menu-complete "$terminfo[kcbt]" reverse-menu-complete

setopt globdots

# Syntax highlighting
source $zsh_conf_dir/fast-syntax-highlighting/fast-syntax-highlighting.plugin.zsh

# History
HISTFILE=$zsh_conf_dir/history
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
alias d='ranger'
alias git-dotfiles="git --git-dir=$HOME/dotfiles --work-tree=$HOME"
alias gits="git status"

# Prompt
eval "$(starship init zsh)"
