# AUTOCOMPLETIONS
source $HOME/.config/zsh/zsh-autocomplete/zsh-autocomplete.plugin.zsh
# iteractive comments are required for autocopletions to be shown when typing
setopt interactive_comments
# show dotfiles
setopt globdots
# cd automaticly if path typed
setopt autocd

zstyle ':autocomplete:*' delay 0.2

# custom completions
FPATH="$HOME/.config/zsh-completions:$FPATH"

# HISTORY
HISTFILE=~/.zshhist
HISTSIZE=5000
SAVEHIST=$HISTSIZE
HISTDUP=erase
setopt appendhistory
setopt sharehistory
setopt hist_ignore_space
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups
setopt EXTENDED_HISTORY


# ALIASES
alias ls='eza -a --icons=auto'
alias ll='eza -ahlF --icons=auto'
alias e='$EDITOR'
alias py='python'
alias mv='mv -i'
alias cp='cp -i'
alias dotfiles="git --git-dir=$HOME/dotfiles --work-tree=$HOME"
alias gits="git status"
alias doas='doas --'
alias mime="xdg-mime query filetype"


# KEYBINDS
source "$HOME/.config/zsh/zsh-helix-mode/helix-mode.zsh"

# make tab complete with zsh-autocomplete
bindkey '\t' menu-select "$terminfo[kcbt]" menu-select
bindkey -M menuselect '\t' menu-complete "$terminfo[kcbt]" reverse-menu-complete

# alt + h,j,k,l zsh-autocomplete binds
bindkey '^[l' menu-select
bindkey '^[h' menu-select
bindkey '^[j' menu-select
bindkey '^[k' history-search-backward
bindkey -M menuselect '^[l' forward-char
bindkey -M menuselect '^[h' backward-char
bindkey -M menuselect '^[j' down-history
bindkey -M menuselect '^[k' up-history


# PROMPT
function git_branch_name()
{
  branch=$(git symbolic-ref HEAD 2> /dev/null | awk 'BEGIN{FS="/"} {print $NF}')
  if [[ $branch == "" ]];
  then
    :
  else
    echo '%F{red} '$branch''
  fi
}

# add or remove $1 in front of command buffer
toggle_prefix() {
  [[ ! $BUFFER =~ "$1 .*" ]] && BUFFER="$1 $BUFFER" || BUFFER="${BUFFER:((${#1}+1))}"
  zle end-of-line
}

prefix_doas() {
  toggle_prefix doas
}

prefix_edit() {
  toggle_prefix e
}

zle -N prefix_doas
zle -N prefix_edit

bindkey "^b" prefix_doas
bindkey "^e" prefix_edit

if [[ "$TERM" = "alacritty" ]]; then
  change-title() {
    print -Pn "\e]0;$BUFFER\a" 
    zle accept-line
  }
  zle -N change-title
  bindkey "^M" change-title
fi

setopt prompt_subst
PROMPT='
%F{yellow}󰘦 %? %F{green} %D{%H:%M:%S} %F{blue} %d $(git_branch_name)
%F{cyan}→%f '

title-change() {
  print -Pn "\e]0;$PWD\a" 
}

[[ "$TERM" = "alacritty" ]] && PROMPT="\$(title-change)$PROMPT"

# Wlecome scritp
sh ~/.config/scripts/welcome_shell/run.sh

# Syntax highlighting
typeset -A ZSH_HIGHLIGHT_STYLES
ZSH_HIGHLIGHT_STYLES[path]='fg=magenta'
ZSH_HIGHLIGHT_STYLES[assign]='fg=cyan'
ZSH_HIGHLIGHT_STYLES[path_prefix]='fg=white'
source $HOME/.config/zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.plugin.zsh

chpwd() {
  ls
}

debug() {
  # start saving errors to file
  exec 2>&2 2>>debug.log
}
debug

PATH="$PATH:$HOME/.config/scripts/path"
