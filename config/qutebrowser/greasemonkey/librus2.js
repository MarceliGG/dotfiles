// ==UserScript==
// @name        Librus Redirect
// @match       https://portal.librus.pl/rodzina
// @grant       none
// @version     1.0
// @author      MarceliGG
// @description Automaticly redirects
// @icon        https://synergia.librus.pl/images/synergia.ico
// ==/UserScript==

setTimeout(() => {
  document.querySelector("a[href=\"/rodzina/synergia/loguj\"]").click()
}, 100)
