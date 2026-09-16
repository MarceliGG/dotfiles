# source "$HOME/.config/zsh/zsh-autocomplete/zsh-autocomplete.plugin.zsh" # commit adfade3
FPATH="$HOME/.config/zsh-completions:$FPATH"

setopt interactive_comments
setopt globdots
setopt autocd

source "$HOME/.config/zsh/zsh-helix-mode/zsh-helix-mode.zsh"

autoload -U compinit; compinit
source "$HOME/.config/zsh/fzf-tab/fzf-tab.zsh"

zstyle ':fzf-tab:complete:cd:*' fzf-preview 'eza -w $FZF_PREVIEW_COLUMNS --color=always --icons=auto -A $realpath'
zstyle ':fzf-tab:*' fzf-flags --height=60%

zhm_wrap_widget fzf-tab-complete zhm_fzf_tab_complete
bindkey '^I' zhm_fzf_tab_complete

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

# ALIASES
alias e="$EDITOR"
alias lg="lazygit"
alias .f="cd ~/dotfiles"
alias py='python'
alias ga="git add"
alias gs="git status"
alias gc="git commit -m"
alias gp="git pull"
alias gP="git push"
alias t="trash"
alias ls="eza -A --icons=auto"
alias cp="cp -i"
alias mv="mv -i"

gd() {
  git diff --name-only --relative --diff-filter=d -z $@ | xargs -0 bat --diff
}

mkcd() {
  mkdir "$1" && cd "$1"
}

# Add colors to pacman
pacman() {
  command pacman "$@" | sed -E '
    /core\//        s/core\//\x1b[1;32m&\x1b[0m/g
    /extra\//       s/extra\//\x1b[1;33m&\x1b[0m/g
    /multilib\//    s/multilib\//\x1b[1;34m&\x1b[0m/g
    /chaotic-aur\// s/chaotic-aur\//\x1b[1;35m&\x1b[0m/g
  '
}

# color docs with bat
export MANPAGER="sh -c 'col -bx | bat -l man -p'"
export MANROFFOPT='-c'
help () {
  "$1" --help | bat -l help
}

# FZF
fzf_cd() {
  local dir
  dir=$(find . -type d -maxdepth 6 2> /dev/null | fzf --reverse --prompt "cd: " --preview 'eza -w $FZF_PREVIEW_COLUMNS --color=always -A --icons=auto {}' --height 60%)
  if [[ -n $dir ]]; then
    cd "$dir" || return
  fi
  zle reset-prompt
}
zle -N fzf_cd
bindkey '^G' fzf_cd

fzf_hist() {
  local selected
  selected=$(fc -l -n 1 | sed 's/[[:space:]]\+$//' | awk '!seen[$0]++' | fzf --reverse --prompt "History: " --height 60%)
  if [[ -n $selected ]]; then
    BUFFER="$selected"
    CURSOR=${#LBUFFER}
  fi
  zle reset-prompt
}
zle -N fzf_hist
bindkey '^R' fzf_hist

fzf_file() {
  local selected
  selected=$(find . -type f -maxdepth 6 2> /dev/null | fzf --reverse --preview 'previewer {}' --height 60%)
  if [[ -n $selected ]]; then
    LBUFFER="$LBUFFER$selected"
    CURSOR=${#LBUFFER}
  fi
  zle reset-prompt
}
zle -N fzf_file
bindkey '^F' fzf_file

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
  else
    echo ' on %F{red} %B'$branch'%b%f'
  fi
}

function preexec() {
  timer=$(date +%s.%3N)
}

timer_show=0

function precmd() {
  print -Pn "\e]0;%~\a" # Set title
  print -Pn "\e]133;A\e\\"
  if [ $timer ]; then
    timer_show=$(printf "%.3f" "$(($(date +%s.%3N) - $timer))")
  fi
}

setopt prompt_subst
PROMPT='
returned %F{yellow}󰘦 %B%?%b%f after %F{green}󰄉 %B${timer_show}s%b%f
in %F{blue} %B%~%b%f$(git_branch_name)
%F{magenta}%f '

# Run after cd
if [[ "$TERM" = "foot" ]]; then
chpwd() {
  ls
  printf '\e]7;file://%s%s\e\' $HOST ${PWD//(#m)([^@-Za-z&-;_~])/%${(l:2::0:)$(([##16]#MATCH))}}
}
else
chpwd() {
  ls
}
fi

# Syntax highlighting
source "$HOME/.config/zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.plugin.zsh"
zhm-add-update-region-highlight-hook
typeset -A ZSH_HIGHLIGHT_STYLES
ZSH_HIGHLIGHT_STYLES[path]='fg=blue'
ZSH_HIGHLIGHT_STYLES[assign]='fg=cyan'
ZSH_HIGHLIGHT_STYLES[path_prefix]='fg=magenta'
ZSH_HIGHLIGHT_STYLES[comment]='fg=yellow'

