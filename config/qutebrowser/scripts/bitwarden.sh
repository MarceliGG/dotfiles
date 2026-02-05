#!/bin/sh

type="$1"
search="$2"

keyid="$(keyctl request user bw_session)"

export BW_SESSION="$(keyctl pipe "$keyid")"

echo "message-info 'Loading Bitwarden...'" > $QUTE_FIFO

status() {
  bw status | jq '.["status"]'
}

get_logins() {
  echo $BW_SESSION
  logins="$(bw list items --search "$search")"
  picked="$(echo $logins | jq -r ".[] | .login.username " | rofi -dmenu -p "Select Login")"
  picked="$(echo $logins | jq ".[] | select(.login.username == \"$picked\")")"
  username="$(echo $picked | jq -r ".login.username")"
  password="$(echo $picked | jq -r ".login.password")"
  case "$type" in
    username) echo "fake-key $username" > $QUTE_FIFO;;
    password) echo "fake-key $password" > $QUTE_FIFO;;
    both) echo "fake-key $username<tab>$password" > $QUTE_FIFO;;
    *) fail "Unknown Type";;
  esac
}

fail () {
  echo "message-warning 'Bitwarden: $1'" > $QUTE_FIFO
  exit 0
}

bw_login() {
  pass="$(rofi -password -dmenu -p "Bitwarden Password")" || fail "Canceled"
  session="$(bw unlock --raw "$pass")" || fail "Unlock Failed"
  export BW_SESSION="$session"
  keyctl add user bw_session "$BW_SESSION" "@u"
  get_logins
}

# bw list items

case "$(status)" in
  \"unlocked\") get_logins;;
  *) bw_login;;
esac

echo "message-info 'BW exited.'" > $QUTE_FIFO
