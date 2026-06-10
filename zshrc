# source "$HOME/.config/zsh/zsh-autocomplete/zsh-autocomplete.plugin.zsh" # commit adfade3
FPATH="$HOME/.config/zsh-completions:$FPATH"

setopt interactive_comments
setopt globdots
setopt autocd

autoload -U compinit; compinit
source "$HOME/.config/zsh/fzf-tab/fzf-tab.zsh"

zstyle ':fzf-tab:complete:cd:*' fzf-preview 'eza -w $FZF_PREVIEW_COLUMNS --color=always --icons=auto -A $realpath'
zstyle ':fzf-tab:*' fzf-flags --height=60%

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

source "$HOME/.config/zsh/zsh-helix-mode/helix-mode.zsh"

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
fzf-cd() {
  local dir
  dir=$(find . -type d -maxdepth 6 2> /dev/null | fzf --reverse --prompt "cd: " --preview 'eza -w $FZF_PREVIEW_COLUMNS --color=always -A --icons=auto {}' --height 60%)
  if [[ -n $dir ]]; then
    cd "$dir" || return
  fi
  zle reset-prompt
}
zle -N fzf-cd
bindkey '^G' fzf-cd

fzf-hist() {
  local selected
  selected=$(fc -l -n 1 | sed 's/[[:space:]]\+$//' | awk '!seen[$0]++' | fzf --reverse --prompt "History: " --height 60%)
  if [[ -n $selected ]]; then
    BUFFER="$selected"
    CURSOR=${#LBUFFER}
  fi
  zle reset-prompt
}
zle -N fzf-hist
bindkey '^R' fzf-hist

fzf-file() {
  local selected
  selected=$(find . -type f -maxdepth 6 2> /dev/null | fzf --reverse --preview 'previewer {}' --height 60%)
  if [[ -n $selected ]]; then
    LBUFFER="$LBUFFER$selected"
    CURSOR=${#LBUFFER}
  fi
  zle reset-prompt
}
zle -N fzf-file
bindkey '^F' fzf-file

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
function hx_mode() {
  case $KEYMAP in
    hxcmd) echo -ne '%F{cyan}%f' ;;
    hxvis) echo -ne '%F{magenta}%f' ;;
    *) echo -ne '%F{green}%f' ;;
  esac
}

function git_branch_name() {
  branch=$(git symbolic-ref HEAD 2> /dev/null | awk 'BEGIN{FS="/"} {print $NF}')
  if [[ $branch == "" ]];
  then
  else
    echo '───(%F{red} %B'$branch'%b%f)'
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

function zle-keymap-select {
  zle reset-prompt
  case $KEYMAP in
    hxcmd) echo -ne '\e[1 q' ;;
    hxvis) echo -ne '\e[3 q' ;;
    *) echo -ne '\e[5 q' ;;
  esac
}
zle -N zle-keymap-select

# ╚╔─═
setopt prompt_subst
PROMPT='
┌──(%F{yellow}󰘦 %B%?%b%f)───(%F{green}󰄉 %B${timer_show}ms%b%f)───(%F{blue} %B%d%b%f)$(git_branch_name)───>
└─$(hx_mode) '

chpwd() {
  ls
}

# tell foot current directory
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

