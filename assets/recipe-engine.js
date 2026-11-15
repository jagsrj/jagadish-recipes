/*
 * Jagadish & Manju's Kitchen – shared recipe engine.
 * A recipe page defines window.RECIPE (see recipes/_template/index.html) and loads this file.
 *
 * Scaling: f = (amount entered) / (base amount).
 *   Ingredient  { id, name, amt, unit, exp?, spice?, spiceExp?, plural?, note? }
 *     unit: "tsp" | "tbsp" | "cup" | "g" | "count" | "sprig" | "main" (the main ingredient itself)
 *     exp:  how it grows with f (1 = linear, default). Use < 1 for water, oil, chilies.
 *   image: optional hero photo, e.g. "/images/my-dish.jpg" (16:10 works best).
 *   scale.servingsInput: true adds a "cooking for N people" box that sets the main-ingredient weight.
 *   Step        { t, min, exp?, txt, bigNote?, parallel? }  (parallel: happens alongside another step, not counted in total time)
 *     txt can use {id} to show an ingredient's scaled quantity, e.g. "Add {water} water".
 *     bigNote is appended when the batch is more than 1.6× the base.
 */
(function () {
  "use strict";
  var R = window.RECIPE;
  if (!R) return;
  var LB = 453.592;
  var scale = R.scale; // { type: "weight", label, baseGrams, defaultUnit, defaultValue } or { type: "servings", base }
  var storeKey = "jr-" + R.slug;

  // ---------- formatting ----------
  var FR = { 0.25: "¼", 0.33: "⅓", 0.5: "½", 0.67: "⅔", 0.75: "¾" };
  function frac(x) {
    var whole = Math.floor(x), rest = x - whole, best = 0, bd = 9;
    [0, 0.25, 0.33, 0.5, 0.67, 0.75, 1].forEach(function (o) { var d = Math.abs(rest - o); if (d < bd) { bd = d; best = o; } });
    if (best === 1) { whole += 1; best = 0; }
    if (best === 0) return whole ? String(whole) : "¼";
    return (whole ? whole + " " : "") + FR[best];
  }
  function volume(amt, unit) {
    var tsp = unit === "tsp" ? amt : unit === "tbsp" ? amt * 3 : amt * 48;
    if ((unit === "cup" && tsp >= 11) || tsp >= 18) return frac(tsp / 48) + " cup" + (tsp / 48 > 1.1 ? "s" : "");
    if (tsp >= 2.85) return frac(tsp / 3) + " tbsp";
    return frac(tsp) + " tsp";
  }
  function fmtWeight(g) {
    return (Math.round(g / LB * 100) / 100) + " lb (" + (g >= 1000 ? (Math.round(g / 10) / 100) + " kg" : Math.round(g) + " g") + ")";
  }
  function fmtGrams(g) { return g >= 1000 ? (Math.round(g / 10) / 100) + " kg" : Math.round(g) + " g"; }
  function fmtMin(m) {
    if (m < 1) return Math.round(m * 60) + " sec";
    m = Math.round(m);
    if (m < 60) return m + " min";
    return Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : "");
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- build page shell ----------
  document.title = R.title + " – Jagadish & Manju's Kitchen";
  var root = document.getElementById("recipe");
  var isWeight = scale.type === "weight";
  root.innerHTML =
    (R.image
      ? "<header class='rhero'><img src='" + esc(R.image) + "' alt='" + esc(R.title) + "' fetchpriority='high'>" +
        "<div class='rhero-text'>" + (R.native ? "<div class='native'>" + esc(R.native) + "</div>" : "") +
        "<h1>" + esc(R.title) + "</h1>" + (R.author ? "<div class='byline'>By " + esc(R.author) + "</div>" : "") +
        "</div></header><p class='lede'>" + esc(R.intro || "") + "</p>"
      : "<header>" + (R.native ? "<div class='native'>" + esc(R.native) + "</div>" : "") +
        "<h1>" + esc(R.title) + "</h1>" +
        (R.author ? "<div class='byline'>By " + esc(R.author) + "</div>" : "") + "<p class='lede'>" + esc(R.intro || "") + "</p></header>") +
    "<section class='card scaler' aria-label='Recipe scaler'>" +
      "<label class='title' for='amt'>" + esc(scale.label || (isWeight ? "How much do you have?" : "How many servings?")) + "</label>" +
      "<div class='row'><input id='amt' type='number' inputmode='decimal' min='0.1' step='" + (isWeight ? "0.1" : (scale.step || 1)) + "'>" + (!isWeight && scale.unitLabel ? "<span class='unitlbl'>" + esc(scale.unitLabel) + "</span>" : "") +
      (isWeight ? "<div class='seg' role='group' aria-label='Unit'><button type='button' data-unit='lb'>lb</button><button type='button' data-unit='kg'>kg</button></div>" : "") +
      "</div>" +
      (isWeight && scale.servingsInput ? "<div class='row srvrow'><label for='srv'>or cooking for</label>" +
        "<input id='srv' type='number' inputmode='numeric' min='1' step='1'><span>people</span></div>" : "") +
      (R.spiceLevels ? "<div class='spice'><span>Heat</span><div class='seg' role='group' aria-label='Spice level'>" +
        "<button type='button' data-spice='0.75'>Mild</button><button type='button' data-spice='1'>Medium</button><button type='button' data-spice='1.35'>Hot</button></div></div>" : "") +
      "<div class='stats'>" + (isWeight && !scale.servingsInput ? "<div>Serves <b id='serves'></b></div>" : "") +
      "<div>Total time <b id='total'></b></div>" + (R.pots ? "<div>Pot <b id='pot'></b></div>" : "") + "</div>" +
      "<div class='warn' id='warn'></div>" +
    "</section>" +
    (R.nutrition ? "<section class='card nutri' aria-label='Nutrition per serving'><h2>Per serving <span class='note' style='display:inline'>(approx.)</span></h2><div class='macros'>" +
      [["protein", "g", "Protein"], ["fiber", "g", "Fiber"], ["netCarbs", "g", "Net carbs"], ["fat", "g", "Fat"], ["kcal", "", "kcal"]].map(function (m) {
        return R.nutrition[m[0]] == null ? "" : "<div class='m m-" + m[0] + "'><b>" + R.nutrition[m[0]] + m[1] + "</b><span>" + m[2] + "</span></div>";
      }).join("") + "</div>" + (R.nutrition.note ? "<p class='note'>" + R.nutrition.note + "</p>" : "") + "</section>" : "") +
    "<section class='card'><h2>Ingredients</h2><p class='note' style='margin:-6px 0 6px'>Tap an item to tick it off.</p><div id='ingredients'></div></section>" +
    "<section class='card'><h2>Method</h2><ol class='steps' id='steps'></ol></section>" +
    (R.tips && R.tips.length ? "<section class='card'><h2>Tips</h2><ul class='tips' id='tips'></ul></section>" : "") +
    "<section class='card ask' id='ask' aria-label='Ask about this recipe'><h2>Ask about this recipe</h2>" +
      "<p class='note'>Stuck on a step? Ask anything, like substitutes, spice, gravy thickness or storing. Answers use your current quantities.</p>" +
      "<div class='ask-log' id='asklog' aria-live='polite'></div>" +
      "<div class='ask-chips' id='askchips'></div>" +
      "<form class='ask-form' id='askform'><input id='askq' type='text' maxlength='400' autocomplete='off' placeholder='e.g. Is my gravy too thick?' aria-label='Your question'>" +
      "<button class='btn' type='submit' id='asksend'>Ask</button></form>" +
      "<p class='note ask-foot'>AI answers can be wrong, so use your judgement, especially about food safety.</p></section>" +
    (R.serveWith ? "<footer>" + esc(R.serveWith) + "</footer>" : "") +
    "<nav class='endnav' aria-label='Page navigation'><a class='btn' id='endback' href='/'>← All recipes</a>" +
      "<button type='button' class='btn ghost' id='share'>Share recipe</button>" +
      "<a class='btn ghost' href='#' id='totop'>↑ Back to top</a></nav>";

  // back link goes to the recipe's menu on the home page
  var MENUS = { weekday: "Weekday recipes", weekend: "Weekend recipes", festival: "Festival recipes" };
  var back = document.querySelector(".sitebar .back");
  var endback = document.getElementById("endback");
  if (MENUS[R.menu]) {
    if (back) { back.href = "/#" + R.menu; back.innerHTML = "<span aria-hidden='true'>‹</span> " + R.menu.charAt(0).toUpperCase() + R.menu.slice(1); back.setAttribute("aria-label", "Back to " + MENUS[R.menu]); }
    endback.href = "/#" + R.menu; endback.textContent = "← Back to " + MENUS[R.menu].toLowerCase();
  } else if (back) { back.innerHTML = "<span aria-hidden='true'>‹</span> All recipes"; }
  document.getElementById("share").addEventListener("click", function () {
    var btn = this, data = { title: R.title + " – Jagadish & Manju's Kitchen", text: R.title, url: location.href.split("#")[0] };
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    var done = function () { btn.textContent = "Link copied ✓"; setTimeout(function () { btn.textContent = "Share recipe"; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(data.url).then(done, function () { prompt("Copy this link:", data.url); });
    else prompt("Copy this link:", data.url);
  });
  // ---------- ask about this recipe ----------
  (function () {
    var log = document.getElementById("asklog"), form = document.getElementById("askform"), input = document.getElementById("askq"),
        send = document.getElementById("asksend"), chips = document.getElementById("askchips"), history = [];
    var defaults = R.menu === "festival"
      ? ["How do I know the oil is at the right temperature?", "How long will these keep?", "What can I substitute if I'm missing something?"]
      : ["How can I make it less spicy?", "What can I substitute if I'm missing something?", "How do I store and reheat leftovers?"];
    var ideas = (R.askIdeas || []).concat(defaults).slice(0, 3);
    chips.innerHTML = ideas.map(function (q) { return "<button type='button' class='chip ask-idea'>" + esc(q) + "</button>"; }).join("");
    chips.addEventListener("click", function (e) { var b = e.target.closest(".ask-idea"); if (b) { input.value = b.textContent; ask(); } });
    form.addEventListener("submit", function (e) { e.preventDefault(); ask(); });
    var fab = document.createElement("a");
    fab.href = "#ask"; fab.className = "ask-fab"; fab.textContent = "💬 Ask"; fab.setAttribute("aria-label", "Ask a question about this recipe");
    fab.addEventListener("click", function (e) { e.preventDefault(); document.getElementById("ask").scrollIntoView({ behavior: "smooth" }); setTimeout(function () { input.focus(); }, 450); });
    document.body.appendChild(fab);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { fab.classList.toggle("hide", en[0].isIntersecting); }).observe(document.getElementById("ask"));
    function fmt(t) {
      return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^\s*[-*•]\s+/gm, "• ").replace(/\n/g, "<br>");
    }
    function context() {
      var amt = document.getElementById("amt").value, unit = isWeight ? " " + state.unit : (scale.unitLabel ? " " + scale.unitLabel : " servings");
      var heat = R.spiceLevels ? (state.spice < 1 ? "Mild" : state.spice > 1 ? "Hot" : "Medium") : "";
      return "Recipe: " + R.title + (R.native ? " (" + R.native + ")" : "") + "\nCooking: " + amt + unit + (heat ? ", heat " + heat : "") +
        "\n\nINGREDIENTS\n" + document.getElementById("ingredients").innerText +
        "\n\nMETHOD\n" + document.getElementById("steps").innerText.replace(/▶ Start [^\n]+ timer/g, "") +
        (document.getElementById("tips") ? "\n\nTIPS\n" + document.getElementById("tips").innerText : "");
    }
    function ask() {
      var q = input.value.trim();
      if (q.length < 3 || send.disabled) return;
      if (history.length >= 15) { log.insertAdjacentHTML("beforeend", "<div class='msg bot'>That's the limit for this page. Reload the page to start a new conversation.</div>"); return; }
      input.value = ""; send.disabled = true; chips.style.display = "none";
      log.insertAdjacentHTML("beforeend", "<div class='msg me'>" + esc(q) + "</div>");
      var bubble = document.createElement("div"); bubble.className = "msg bot thinking"; bubble.textContent = "Thinking…"; log.appendChild(bubble);
      fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, recipe: context(), slug: R.slug, history: history }) })
        .then(function (r) { return r.json().catch(function () { return { error: "unavailable" }; }); })
        .then(function (d) {
          bubble.classList.remove("thinking");
          if (d.answer) { bubble.innerHTML = fmt(d.answer); history.push({ q: q, a: d.answer }); }
          else bubble.textContent = ({
            not_configured: "The recipe assistant isn't switched on yet. Please check back soon.",
            rate_limited: d.scope === "minute" ? "That's a lot of questions at once. Please wait a minute and try again."
                        : d.scope === "site" ? "The assistant has had a busy day. Please try again tomorrow."
                        : "You've reached today's limit for questions. Please try again tomorrow.",
            forbidden: "Please ask from the recipe page on this site.",
            empty: "Please type a question first."
          })[d.error] || "Sorry, I couldn't answer that right now. Please try again in a minute.";
        })
        .catch(function () { bubble.classList.remove("thinking"); bubble.textContent = "You seem to be offline. Try again when you're connected."; })
        .then(function () { send.disabled = false; });
    }
  })();

  document.getElementById("totop").addEventListener("click", function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); });

  // ---------- state ----------
  var state = isWeight ? { unit: scale.defaultUnit || "lb", value: scale.defaultValue, spice: 1 }
                       : { value: scale.base, spice: 1 };
  try {
    var saved = JSON.parse(localStorage.getItem(storeKey) || "null");
    if (saved && saved.value > 0) { for (var k in saved) state[k] = saved[k]; }
  } catch (e) {}
  var $amt = document.getElementById("amt");
  $amt.value = state.value;

  function factor() {
    var v = parseFloat($amt.value);
    if (!(v > 0)) return null;
    if (!isWeight) return { f: v / scale.base, g: null };
    var g = state.unit === "lb" ? v * LB : v * 1000;
    return { f: g / scale.baseGrams, g: g };
  }

  // Find an ingredient for a step's `uses` list.
  function findIng(ref) {
    ref = ref.trim();
    var all = [], m = ref.match(/^([^:]+):\s*(.+)$/), grp = m ? m[1].toLowerCase() : null, name = (m ? m[2] : ref).toLowerCase();
    R.groups.forEach(function (g) {
      if (grp && g.title.toLowerCase().indexOf(grp) !== 0) return;
      g.items.forEach(function (it) { all.push(it); });
    });
    if (!grp) for (var i = 0; i < all.length; i++) if (all[i].id === ref) return all[i];
    var n = function (it) { return (it.name || "").toLowerCase(); };
    var exact = all.filter(function (it) { return n(it) === name; });
    if (exact.length) return exact[0];
    var starts = all.filter(function (it) { return n(it).indexOf(name) === 0; });
    if (starts.length) return starts[0];
    return all.filter(function (it) { return n(it).indexOf(name) > -1; })[0] || null;
  }
  window.__findIng = findIng;

  // ---------- render ----------
  function render() {
    var fx = factor(), warn = document.getElementById("warn");
    if (!fx) { warn.style.display = "block"; warn.textContent = "Enter an amount to see the recipe."; return; }
    var f = fx.f, sp = state.spice;
    warn.style.display = f > 6.5 || f < 0.27 ? "block" : "none";
    warn.textContent = f > 6.5 ? "That's a big batch. Consider cooking it in two pots so it browns properly."
                               : "That's a very small amount. Quantities are rounded, so go by taste.";

    var qty = {}, html = "";
    R.groups.forEach(function (grp) {
      html += "<h3>" + esc(grp.title) + "</h3><ul class='ing'>";
      grp.items.forEach(function (it) {
        var q, label = it.name;
        if (it.unit === "main") {
          q = fx.g ? fmtWeight(fx.g) : fmtGrams(scale.baseGrams * f);
        } else {
          var a = it.amt * Math.pow(f, it.exp != null ? it.exp : 1);
          if (it.spice) a *= Math.pow(sp, it.spiceExp != null ? it.spiceExp : 1);
          if (it.unit === "count" || it.unit === "sprig") {
            var n = Math.max(1, Math.round(a));
            q = String(n);
            if (it.unit === "sprig") label = (n === 1 ? "sprig " : "sprigs ") + label;
            else if (n > 1 && it.plural) label = it.plural;
          } else if (it.unit === "g") {
            q = fmtGrams(a);
          } else {
            q = volume(a, it.unit);
          }
        }
        if (it.id) qty[it.id] = q;
        it._q = q; it._label = label;
        html += "<li tabindex='0'><span class='qty'>" + q + "</span><span>" + esc(label) +
                (it.note ? "<span class='note'>" + esc(it.note) + "</span>" : "") + "</span></li>";
      });
      html += "</ul>";
    });
    document.getElementById("ingredients").innerHTML = html;
    document.querySelectorAll("ul.ing li").forEach(function (li) {
      li.addEventListener("click", function () { li.classList.toggle("done"); });
    });

    var pot = "";
    if (R.pots) { for (var i = 0; i < R.pots.length; i++) { pot = R.pots[i][1]; if (f <= R.pots[i][0]) break; } }
    var extra = { pot: pot ? "large (" + pot + ")" : "large" };

    var total = R.prepMin || 0, sh = "";
    R.steps.forEach(function (s, i) {
      var m = s.min * Math.pow(f, s.exp || 0);
      if (!s.parallel) total += m;
      var txt = esc(s.txt).replace(/\{(\w+)\}/g, function (_, k) {
        if (qty[k] != null) return "<span class='q'>" + qty[k] + "</span>";
        return extra[k] != null ? extra[k] : "";
      });
      if (s.bigNote && f > 1.6) txt += " " + esc(s.bigNote);
      var used = (s.uses || []).map(function (u) {
        var parts = u.split("|"), it = findIng(parts[0]);
        if (!it) return "";
        var short = it._label.split(/,| \(/)[0];
        return "<span class='chip'><b>" + it._q + "</b> " + esc(short) + (parts[1] ? " <i>(" + esc(parts[1]) + ")</i>" : "") + "</span>";
      }).join("");
      if (used) txt += "<div class='uses'><span class='uses-h'>In this step</span>" + used + "</div>";
      sh += "<li><span class='st'>" + esc(s.t) + " · " + fmtMin(m) + "</span>" + txt +
            "<br><button class='timer' data-i='" + i + "' data-sec='" + Math.round(m * 60) + "'>▶ Start " + fmtMin(m) + " timer</button></li>";
    });
    document.getElementById("steps").innerHTML = sh;
    document.querySelectorAll(".timer").forEach(function (b) { b.addEventListener("click", toggleTimer); });
    tickTimers();

    var srvN = Math.max(1, Math.round(R.baseServings * f));
    if (isWeight && !scale.servingsInput) document.getElementById("serves").textContent = srvN;
    var $srv = document.getElementById("srv");
    if ($srv && document.activeElement !== $srv) $srv.value = srvN;
    document.getElementById("total").textContent = "~" + fmtMin(total);
    if (R.pots) document.getElementById("pot").textContent = pot;

    var tips = document.getElementById("tips");
    if (tips) {
      tips.innerHTML = R.tips.map(function (t) {
        var s = typeof t === "function" ? t(f, qty, volume) : t;
        return "<li>" + s + "</li>";
      }).join("");
    }
    try {
      var out = { value: parseFloat($amt.value), spice: state.spice };
      if (isWeight) out.unit = state.unit;
      localStorage.setItem(storeKey, JSON.stringify(out));
    } catch (e) {}
  }

  // ---------- timers ----------
  // Each timer stores the time it ends (saved on this phone), not a countdown, so it stays
  // right when the screen locks, you switch apps, reload, or leave and come back to the page.
  var timerKey = "timers:" + (R.slug || location.pathname), T = {};
  try { T = JSON.parse(localStorage.getItem(timerKey) || "{}") || {}; } catch (e) { T = {}; }
  function saveTimers() { try { localStorage.setItem(timerKey, JSON.stringify(T)); } catch (e) {} }
  function mmss(sec) { var m = Math.floor(sec / 60), x = sec % 60; return (m >= 60 ? Math.floor(m / 60) + ":" + ("0" + (m % 60)).slice(-2) : m) + ":" + (x < 10 ? "0" : "") + x; }
  function stepTitle(i) { return R.steps[i] ? R.steps[i].t : "Timer"; }

  function toggleTimer(e) {
    var b = e.currentTarget, i = b.dataset.i, t = T[i];
    if (t && !t.done) { delete T[i]; saveTimers(); tickTimers(); b.textContent = "▶ Restart timer"; return; }
    T[i] = { end: Date.now() + parseInt(b.dataset.sec, 10) * 1000 };
    unlockAudio(); saveTimers(); tickTimers();
  }

  var baseTitle = document.title, banner = null, pill = null;
  function tickTimers() {
    var now = Date.now(), running = [], newlyDone = [];
    Object.keys(T).forEach(function (i) {
      var t = T[i];
      if (!t.done && t.end <= now) { t.done = true; newlyDone.push(i); }
      if (!t.done) running.push({ i: i, left: Math.ceil((t.end - now) / 1000) });
    });
    if (newlyDone.length) { saveTimers(); alarm(newlyDone, now); }
    document.querySelectorAll(".timer").forEach(function (b) {
      var t = T[b.dataset.i];
      b.classList.toggle("running", !!(t && !t.done));
      b.classList.toggle("finished", !!(t && t.done));
      if (t && !t.done) b.textContent = "⏸ " + mmss(Math.ceil((t.end - now) / 1000)) + " · tap to stop";
      else if (t && t.done) b.textContent = "✓ Done · tap to restart";
      else if (!/Restart/.test(b.textContent)) b.textContent = "▶ Start " + fmtMin(parseInt(b.dataset.sec, 10) / 60) + " timer";
    });
    running.sort(function (a, b2) { return a.left - b2.left; });
    if (!pill) {
      pill = document.createElement("button"); pill.type = "button"; pill.className = "timer-pill";
      pill.addEventListener("click", function () {
        var b = document.querySelector(".timer[data-i='" + pill.dataset.i + "']");
        if (b) b.closest("li").scrollIntoView({ behavior: "smooth", block: "center" });
      });
      document.body.appendChild(pill);
    }
    if (running.length) {
      pill.dataset.i = running[0].i;
      pill.innerHTML = "⏱ <b>" + mmss(running[0].left) + "</b> " + esc(stepTitle(running[0].i)) + (running.length > 1 ? " <i>+" + (running.length - 1) + "</i>" : "");
      pill.style.display = "block";
      document.title = "⏱ " + mmss(running[0].left) + " · " + R.title;
    } else { pill.style.display = "none"; document.title = baseTitle; }
    keepAwake(running.length > 0);
  }
  setInterval(tickTimers, 1000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { tickTimers(); keepAwake(hasRunning(), true); } });
  window.addEventListener("pageshow", tickTimers);
  function hasRunning() { return Object.keys(T).some(function (i) { return !T[i].done; }); }

  function alarm(list, now) {
    var late = list.map(function (i) { return now - T[i].end; }), mins = Math.round(Math.max.apply(null, late) / 60000);
    var names = list.map(stepTitle).join(", ");
    if (!banner) {
      banner = document.createElement("div"); banner.className = "timer-banner"; banner.setAttribute("role", "alert");
      banner.addEventListener("click", function () { banner.style.display = "none"; });
      document.body.appendChild(banner);
    }
    banner.innerHTML = "⏰ <b>" + esc(names) + "</b> timer is done" + (mins >= 1 ? " (finished " + mins + " min ago)" : "") + ". <u>OK</u>";
    banner.style.display = "block";
    try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]); } catch (err) {}
    beep(3);
  }

  // Sound needs a tap first on phones, so the audio is unlocked when a timer is started.
  var actx = null;
  function unlockAudio() {
    try {
      if (!actx) { var C = window.AudioContext || window.webkitAudioContext; actx = new C(); }
      if (actx.state === "suspended") actx.resume();
    } catch (e) {}
  }
  function beep(times) {
    try {
      unlockAudio(); if (!actx) return;
      for (var k = 0; k < (times || 1); k++) {
        var o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + k * 0.8;
        o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
        o.start(t0); o.stop(t0 + 0.6);
      }
    } catch (e) {}
  }

  // Keep the screen on while a timer runs, so the phone doesn't lock mid-cook.
  var wake = null;
  function keepAwake(on, force) {
    if (!("wakeLock" in navigator)) return;
    if (on && (!wake || force) && document.visibilityState === "visible") {
      navigator.wakeLock.request("screen").then(function (w) { wake = w; w.addEventListener("release", function () { if (wake === w) wake = null; }); }).catch(function () {});
    } else if (!on && wake) { wake.release().catch(function () {}); wake = null; }
  }

  // ---------- controls ----------
  function setOn(sel, attr, val) {
    document.querySelectorAll(sel).forEach(function (b) { b.classList.toggle("on", b.getAttribute(attr) === String(val)); });
  }
  document.querySelectorAll("[data-unit]").forEach(function (b) {
    b.addEventListener("click", function () {
      var nu = b.dataset.unit; if (nu === state.unit) return;
      var fx = factor();
      state.unit = nu;
      if (fx) $amt.value = nu === "lb" ? Math.round(fx.g / LB * 100) / 100 : Math.round(fx.g / 10) / 100;
      setOn("[data-unit]", "data-unit", nu); render();
    });
  });
  document.querySelectorAll("[data-spice]").forEach(function (b) {
    b.addEventListener("click", function () { state.spice = parseFloat(b.dataset.spice); setOn("[data-spice]", "data-spice", b.dataset.spice); render(); });
  });
  $amt.addEventListener("input", render);
  var $srvIn = document.getElementById("srv");
  if ($srvIn) $srvIn.addEventListener("input", function () {
    var n = parseFloat($srvIn.value);
    if (!(n > 0)) return;
    var g = n * scale.baseGrams / R.baseServings;
    $amt.value = state.unit === "lb" ? Math.round(g / LB * 100) / 100 : Math.round(g / 10) / 100;
    render();
  });
  setOn("[data-unit]", "data-unit", state.unit);
  setOn("[data-spice]", "data-spice", state.spice);
  render();
})();
