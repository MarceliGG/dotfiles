// ==UserScript==
// @name        Reddit mod
// @match       https://www.reddit.com/*
// @grant       none
// @version     1.0
// @author      MarceliGG
// ==/UserScript==

setTimeout(() => {
  const style = document.createElement("style")
  style.innerHTML = `
    shreddit-comments-page-ad,
    shreddit-ad-post {
      display: none !important;
    }
  `
  document.body.appendChild(style)
}, 100)
