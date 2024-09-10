# Autocomlition
source $HOME/.config/zsh/zsh-autocomplete/zsh-autocomplete.plugin.zsh
autoload -U compinit
compinit

setopt globdots

bindkey '\t' menu-select "$terminfo[kcbt]" menu-select
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


alias ls='eza -a --icons=auto'
alias lsl='eza -ahlF --icons=auto'
alias remove='/bin/rm'
alias e='$EDITOR'
alias py='python3.12'
alias mv='mv -i'
alias cp='cp -i'
alias rm='trash'
alias dotfiles="git --git-dir=$HOME/dotfiles --work-tree=$HOME"
alias gits="git status"
alias doas='doas --'


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

# function exit_code()
# {
#   code="$?"
#   if [[ $code == 0 ]];
#   then
#     echo '%F{green} '$code''
#   else
#     echo '%F{red} '$code''
#   fi
# }

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
PROMPT='%F{red}returned %F{yellow}%? %F{red}at %F{yellow}%D{%L:%M:%S}
%F{blue} %d  $(git_branch_name)
%F{yellow}→%f '

PS2=" %F{cyan}>%f  "

sh ~/.config/scripts/welcome_shell/run.sh


# Syntax highlighting
typeset -A ZSH_HIGHLIGHT_STYLES
ZSH_HIGHLIGHT_STYLES[path]='fg=magenta'
ZSH_HIGHLIGHT_STYLES[assign]='fg=cyan'
ZSH_HIGHLIGHT_STYLES[path_prefix]='fg=white'
source $HOME/.config/zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.plugin.zsh
