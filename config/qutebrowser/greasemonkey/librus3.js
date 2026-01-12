// ==UserScript==
// @name        Librus Grades Ugrades
// @match       https://synergia.librus.pl/przegladaj_oceny/uczen
// @grant       none
// @version     1.0
// @author      MarceliGG
// @icon        https://synergia.librus.pl/images/synergia.ico
// ==/UserScript==

const parseOcena = (o) => {
  const mod = o.includes("-") ? -0.25 : o.includes("+") ? 0.5 : 0
  let n = parseInt(o)
  if (!n) n = 1
  return n + mod
}


setTimeout(() => {
  const style = document.createElement("style")
  style.innerHTML = `
    .container-background,
    body {
      background: #111 !important;
    }

    tr.line0,
    h2.inside {
      background: #262626 !important;
    }
    tr.line1 {
      background: #343434 !important;
    }
    tr:hover {
      background: #444 !important;
    }
    td {
      border: none !important;
      color: #aaa !important;
      background: transparent !important;
    }

    tfoot {
      display: none !important;
    }

    thead td,
    th {
      background: #1a1a1a !important;
    }
    thead td span {
      background: #262626 !important;
    }
    html body #page table.decorated thead td {
      border: none !important;
    }
  `
  body.appendChild(style)

  document.querySelectorAll("#body > form:nth-child(6) > div > div > table:nth-child(9) > tbody > tr:not([name])").forEach(p => {
    if (p.innerText.includes("Zachowanie")) return

    const o1 = p.querySelector("tr > td:nth-child(3)")
    const s1 = p.querySelector("tr > td:nth-child(4)")

    const o2 = p.querySelector("tr > td:nth-child(7)")
    const s2 = p.querySelector("tr > td:nth-child(8)")

    const s = p.querySelector("tr > td:nth-child(10)")

    s1.innerHTML = '-'
    s1.style.textAlign = 'center'
    s2.innerHTML = '-'
    s2.style.textAlign = 'center'
    s.innerHTML = '-'
    s.style.textAlign = 'center'

    let ss1 = 0;
    let ss2 = 0;

    if (!o1.innerText.includes("Brak ocen")) {
      g1 = Array.from(o1.querySelectorAll(".grade-box")).map(g => {
        let w = 1
        if (g.innerHTML.indexOf("<br>Waga: ") != -1)
          w = parseInt(g.innerHTML[g.innerHTML.indexOf("<br>Waga: ") + 10])
        return {
          n: parseOcena(g.innerText),
          w
        }
      })
      ss1 = g1.reduce((p, c) => p + c.n * c.w, 0)
        / g1.reduce((p, c) => p + c.w, 0)
      s1.innerHTML = `${Math.round(100 * ss1) / 100}`
    }

    if (!o2.innerText.includes("Brak ocen")) {
      g2 = Array.from(o2.querySelectorAll(".grade-box")).map(g => {
        let w = 1
        if (g.innerHTML.indexOf("<br>Waga: ") != -1)
          w = parseInt(g.innerHTML[g.innerHTML.indexOf("<br>Waga: ") + 10])
        return {
          n: parseOcena(g.innerText),
          w
        }
      })
      ss2 = g2.reduce((p, c) => p + c.n * c.w, 0)
        / g2.reduce((p, c) => p + c.w, 0)
      s2.innerHTML = `${Math.round(100 * ss2) / 100}`
    }

    if (ss1 && ss2) s.innerHTML = Math.round(100 * (ss1 + ss2 / 2)) / 100
  })
}, 100)
