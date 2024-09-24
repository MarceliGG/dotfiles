# Autocomlition
source $HOME/.config/zsh/zsh-autocomplete/zsh-autocomplete.plugin.zsh
autoload -U compinit
compinit

zstyle ':autocomplete:' add-space ''

setopt globdots

bindkey -v '\t' menu-select "$terminfo[kcbt]" menu-select
bindkey -M menuselect '\t' menu-complete "$terminfo[kcbt]" reverse-menu-complete



# History
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
alias py='python3.12'
alias mv='mv -i'
alias cp='cp -i'
alias dotfiles="git --git-dir=$HOME/dotfiles --work-tree=$HOME"
alias gits="git status"
alias doas='doas --'
alias mime="xdg-mime query filetype"


# BINDS
bindkey -v
KEYTIMEOUT=1

bindkey -M menuselect 'h' vi-backward-char
bindkey -M menuselect 'k' vi-up-line-or-history
bindkey -M menuselect 'l' vi-forward-char
bindkey -M menuselect 'j' vi-down-line-or-history
bindkey -v '^?' backward-delete-char

# Make vi mode closer to kakoune/helix binds
bindkey -a 'x' visual-line-mode
bindkey -a 'd' vi-delete-char
bindkey -M visual 'x' visual-line-mode
bindkey -M visual 'd' vi-delete

# Make cursor change style
function zle-keymap-select () {
    case $KEYMAP in
        vicmd) echo -ne '\e[2 q';;      # block
        viins|main) echo -ne '\e[6 q';; # beam
    esac
}
zle -N zle-keymap-select
zle-line-init() {
    # zle -K viins # initiate `vi insert` as keymap (can be removed if `bindkey -V` has been set elsewhere)
    echo -ne "\e[6 q"
}
zle -N zle-line-init


# PROMPT
function git_branch_name()
{
  branch=$(git symbolic-ref HEAD 2> /dev/null | awk 'BEGIN{FS="/"} {print $NF}')
  if [[ $branch == "" ]];
  then
    :
  else
    echo '%F{yellow}on %F{red} '$branch''
  fi
}

del-prompt-accept-line() {
    OLD_PROMPT="$PROMPT"
    PROMPT="%F{yellow}→%f "
    zle reset-prompt
    PROMPT="$OLD_PROMPT"
    zle accept-line
}
zle -N del-prompt-accept-line
bindkey "^M" del-prompt-accept-line

setopt prompt_subst
PROMPT='%F{red}returned %F{yellow}%? %F{red}at %F{yellow}%D{%H:%M:%S}
%F{blue} %d $(git_branch_name)
%F{yellow}→%f '


sh ~/.config/scripts/welcome_shell/run.sh


# Syntax highlighting
typeset -A ZSH_HIGHLIGHT_STYLES
ZSH_HIGHLIGHT_STYLES[path]='fg=magenta'
ZSH_HIGHLIGHT_STYLES[assign]='fg=cyan'
ZSH_HIGHLIGHT_STYLES[path_prefix]='fg=white'
source $HOME/.config/zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.plugin.zsh

PATH="$PATH:$HOME/.config/scripts/path"
