# source "$HOME/.config/zsh/zsh-autocomplete/zsh-autocomplete.plugin.zsh" # commit adfade3

setopt interactive_comments
setopt globdots
setopt autocd

autoload -U compinit; compinit

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

source "$HOME/.config/zsh/zsh-helix-mode/zsh-helix-mode.zsh"

# ALIASES
function expand-alias() {
  zle _expand_alias
  zle self-insert
}
zle -N expand-alias
bindkey -M main ' ' expand-alias

expand-alias-and-accept() {
  zle _expand_alias
  zle accept-line
}
zle -N expand-alias-and-accept
bindkey '^M' expand-alias-and-accept

alias e='$EDITOR'
alias lg="lazygit"
alias .f="cd ~/dotfiles"
alias py='python'
alias ga="git add"
alias gs="git status"
alias gc="git commit -m"
alias gp="git pull"
alias gP="git push"
alias t="trash"

# non-expandable
ls() {
  eza -A --icons=auto "$@"
}

ll() {
  eza -AhlF --icons=auto "$@"
}

cp() {
  command cp -i "$@"
}

mv() {
  command mv -i "$@"
}

gd() {
  git diff --name-only --relative --diff-filter=d -z $@ | xargs -0 bat --diff
}

export MANPAGER="sh -c 'col -bx | bat -l man -p'"
export MANROFFOPT='-c'

# FZF
fzf_cd() {
  echo -n "Cd to: "
  local dir
  dir=$(find . -type d -maxdepth 6 2> /dev/null | fzf --preview 'eza -A --icons=auto {}' --height 40%)
  if [[ -n $dir ]]; then
    cd "$dir" || return
  fi
  zle reset-prompt
}
zle -N fzf_cd
bindkey '^G' fzf_cd

fzf_hist() {
  echo -n "Search history:"
  local selected
  selected=$(fc -l -n 1 | sed 's/[[:space:]]\+$//' | awk '!seen[$0]++' | fzf --height 40%)
  if [[ -n $selected ]]; then
    BUFFER="$selected"
    CURSOR=${#LBUFFER}
  fi
  zle reset-prompt
}
zle -N fzf_hist
bindkey '^R' fzf_hist

fzf_file() {
  echo -n "↰"
  local selected
  selected=$(find . -type f -maxdepth 6 2> /dev/null | fzf --preview 'previewer {}' --height 40%)
  if [[ -n $selected ]]; then
    LBUFFER="$LBUFFER$selected"
    CURSOR=${#LBUFFER}
  fi
  zle reset-prompt
}
zle -N fzf_file
bindkey '^F' fzf_file

# make tab complete with zsh-autocomplete
# bindkey '\t' menu-select "$terminfo[kcbt]" menu-select
# bindkey -M menuselect '\t' menu-complete "$terminfo[kcbt]" reverse-menu-complete

# # h,j,k,l zsh-autocomplete binds
# bindkey '^[l' menu-select
# bindkey '^[h' menu-select
# bindkey '^[j' menu-select
# bindkey '^[k' history-search-backward
# bindkey -M menuselect '^[l' forward-char
# bindkey -M menuselect '^[h' backward-char
# bindkey -M menuselect '^[j' down-history
# bindkey -M menuselect '^[k' up-history

# add or remove $1 in front of command buffer
toggle_prefix() {
  [[ ! $BUFFER =~ "$1 .*" ]] && BUFFER="$1 $BUFFER" || BUFFER="${BUFFER:((${#1}+1))}"
  zle end-of-line
}

prefix_sudo() {
  toggle_prefix sudo
}

prefix_edit() {
  toggle_prefix e
}

zle -N prefix_sudo
zle -N prefix_edit

bindkey "^b" prefix_sudo
bindkey "^e" prefix_edit

# PROMPT
function git_branch_name() {
  branch=$(git symbolic-ref HEAD 2> /dev/null | awk 'BEGIN{FS="/"} {print $NF}')
  if [[ $branch == "" ]];
  then
    echo '%F{blue}%k'
  else
    echo '%F{blue}%K{red} %F{black} '$branch' %F{red}%k'
  fi
}

function preexec() {
  timer=${timer:-$(date +%s.%3N)}
}

timer_show=0

function precmd() {
  if [ $timer ]; then
    timer_show=$(printf "%.0f" "$((($(date +%s.%3N) - $timer) * 1000))")
    unset timer
  fi
}

setopt prompt_subst
PROMPT='
%F{yellow}%K{yellow}%F{black}󰘦 %? %F{yellow}%K{green} %F{black}󰄉 ${timer_show}ms %F{green}%K{blue} %F{black} %d $(git_branch_name)%f%k '

title-change() {
  print -Pn "\e]0;$PWD\a" 
}

[[ "$TERM" = "alacritty" || "$TERM" = "foot" ]] && PROMPT="\$(title-change)$PROMPT"

chpwd() {
  ls
}

if [[ "$TERM" = "foot" ]]; then
  function osc7-pwd() {
      emulate -L zsh # also sets localoptions for us
      setopt extendedglob
      local LC_ALL=C
      printf '\e]7;file://%s%s\e\' $HOST ${PWD//(#m)([^@-Za-z&-;_~])/%${(l:2::0:)$(([##16]#MATCH))}}
  }

  function chpwd-osc7-pwd() {
      (( ZSH_SUBSHELL )) || osc7-pwd
  }
  add-zsh-hook -Uz chpwd chpwd-osc7-pwd
fi

# Syntax highlighting
source "$HOME/.config/zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.plugin.zsh"
typeset -A ZSH_HIGHLIGHT_STYLES
ZSH_HIGHLIGHT_STYLES[path]='fg=blue'
ZSH_HIGHLIGHT_STYLES[assign]='fg=cyan'
ZSH_HIGHLIGHT_STYLES[path_prefix]='fg=magenta'
ZSH_HIGHLIGHT_STYLES[comment]='fg=yellow'

# fastfetch
