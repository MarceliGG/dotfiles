// ==UserScript==
// @name        Librus Autologin
// @match       https://api.librus.pl/OAuth/Authorization*
// @grant       none
// @version     1.0
// @author      MarceliGG
// @description Automaticly logs in
// @icon        https://synergia.librus.pl/images/synergia.ico
// ==/UserScript==

setTimeout(() => {
  const u = localStorage.getItem("login")
  const p = localStorage.getItem("pass")
  if (!u && !p) return
  document.querySelector("#Login").value = u
  document.querySelector("#Pass").value = p
  document.querySelector("#LoginBtn").click()
}, 100)

const btn = document.createElement("button")

btn.innerText = "ZAPISZ"
btn.style.marginBottom = "8px"
btn.onclick = () => {
  localStorage.setItem("login", document.querySelector("#Login").value)
  localStorage.setItem("pass", document.querySelector("#Pass").value)
}

document.querySelector("#formContent").prepend(btn)
