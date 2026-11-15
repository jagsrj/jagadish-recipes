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
      "<label class='title' for='amt'>" + esc(isWeight ? scale.label : "How many servings?") + "</label>" +
      "<div class='row'><input id='amt' type='number' inputmode='decimal' min='0.1' step='" + (isWeight ? "0.1" : "1") + "'>" +
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
    (R.serveWith ? "<footer>" + esc(R.serveWith) + "</footer>" : "");

  // back link goes to the recipe's menu on the home page
  var MENUS = { weekday: "Weekday recipes", weekend: "Weekend recipes" };
  var back = document.querySelector(".sitebar .back");
  if (back && MENUS[R.menu]) { back.href = "/#" + R.menu; back.textContent = "← " + MENUS[R.menu]; }

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

  // ---------- render ----------
  var timers = {};
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
      sh += "<li><span class='st'>" + esc(s.t) + " · " + fmtMin(m) + "</span>" + txt +
            "<br><button class='timer' data-i='" + i + "' data-sec='" + Math.round(m * 60) + "'>▶ Start " + fmtMin(m) + " timer</button></li>";
    });
    document.getElementById("steps").innerHTML = sh;
    Object.keys(timers).forEach(function (k) { clearInterval(timers[k]); });
    timers = {};
    document.querySelectorAll(".timer").forEach(function (b) { b.addEventListener("click", toggleTimer); });

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

  function toggleTimer(e) {
    var b = e.currentTarget, i = b.dataset.i;
    if (timers[i]) { clearInterval(timers[i]); delete timers[i]; b.classList.remove("running"); b.textContent = "▶ Restart timer"; return; }
    var left = parseInt(b.dataset.sec, 10);
    b.classList.remove("finished"); b.classList.add("running");
    function tick() {
      var mm = Math.floor(left / 60), ss = left % 60;
      b.textContent = "⏸ " + mm + ":" + (ss < 10 ? "0" : "") + ss;
      if (left <= 0) {
        clearInterval(timers[i]); delete timers[i];
        b.classList.remove("running"); b.classList.add("finished"); b.textContent = "✓ Done";
        try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (err) {}
        beep();
      }
      left--;
    }
    tick(); timers[i] = setInterval(tick, 1000);
  }
  function beep() {
    try {
      var C = window.AudioContext || window.webkitAudioContext, ctx = new C(), o = ctx.createOscillator(), gN = ctx.createGain();
      o.frequency.value = 880; o.connect(gN); gN.connect(ctx.destination); gN.gain.value = 0.15;
      o.start(); o.stop(ctx.currentTime + 0.6);
    } catch (e) {}
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
