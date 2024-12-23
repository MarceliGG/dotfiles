# AUTOCOMPLETIONS
source $HOME/.config/zsh/zsh-autocomplete/zsh-autocomplete.plugin.zsh
# iteractive comments are required for autocopletions to be shown when typing
setopt interactive_comments
# show dotfiles
setopt globdots

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
alias lsl='eza -ahlF --icons=auto'
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
# Enter -> submit cmd from completions menu
# bindkey -M menuselect '\r' .accept-line


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

# del-prompt-accept-line() {
#     OLD_PROMPT="$PROMPT"
#     PROMPT="%F{yellow}→%f "
#     zle reset-prompt
#     PROMPT="$OLD_PROMPT"
#     zle accept-line
# }
# zle -N del-prompt-accept-line
# bindkey "^M" del-prompt-accept-line

title-change() {
  echo "\033]0;$PWD"
}

setopt prompt_subst
# PROMPT='$(title-change)%F{red}returned %F{yellow}󰘦 %? %F{red}at %F{yellow} %D{%H:%M:%S}
# %F{green}in %F{blue} %d $(git_branch_name)
# %F{yellow}→%f '
PROMPT='
$(title-change)%F{yellow}󰘦 %? %F{green} %D{%H:%M:%S} %F{blue} %d $(git_branch_name)
%F{cyan}→%f '

# Wlecome scritp
sh ~/.config/scripts/welcome_shell/run.sh

# Syntax highlighting
typeset -A ZSH_HIGHLIGHT_STYLES
ZSH_HIGHLIGHT_STYLES[path]='fg=magenta'
ZSH_HIGHLIGHT_STYLES[assign]='fg=cyan'
ZSH_HIGHLIGHT_STYLES[path_prefix]='fg=white'
source $HOME/.config/zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.plugin.zsh

PATH="$PATH:$HOME/.config/scripts/path"
