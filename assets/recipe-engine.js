/*
 * Jagadish & Manju's Kitchen – shared recipe engine.
 * A recipe page defines window.RECIPE (see recipes/_template/index.html) and loads this file.
 *
 * Scaling: f = (amount entered) / (base amount).
 *   Ingredient  { id, name, amt, unit, exp?, spice?, spiceExp?, plural?, note? }
 *     unit: "tsp" | "tbsp" | "cup" | "g" | "count" | "sprig" | "main" (the main ingredient itself)
 *     exp:  how it grows with f (1 = linear, default). Use < 1 for water, oil, chilies.
 *   image: optional hero photo, e.g. "/images/my-dish.jpg" (16:10 works best).
 *   scale.servingsInput: true adds a "Cooking for N people" box. It's independent of the main-ingredient weight:
 *     ingredients and steps marked by: "people" (on the item, step or whole group) scale with the people count,
 *     everything else scales with the weight. E.g. biryani rice follows people, the chicken masala follows the chicken.
 *   Step        { t, min, exp?, txt, bigNote?, parallel? }  (parallel: happens alongside another step, not counted in total time)
 *     txt can use {id} to show an ingredient's scaled quantity, e.g. "Add {water} water".
 *     bigNote is appended when the batch is more than 1.6× the base.
 */
(function () {
  "use strict";
  var R = window.RECIPE;
  var LB = 453.592;

  // Offline support: save the site on this phone (see /sw.js).
  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
  }

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

  // One ingredient's scaled quantity. Shared by recipe pages and the weekly planner.
  // f = batch factor, g = grams of main ingredient (weight recipes) or null, sp = spice factor.
  function ingQty(it, f, g, sc, sp) {
    var q, label = it.name, num = null, unit = it.unit;
    if (it.unit === "main") {
      q = g ? fmtWeight(g) : fmtGrams(sc.baseGrams * f); num = g || sc.baseGrams * f; unit = "g";
    } else {
      var a = it.amt * Math.pow(f, it.exp != null ? it.exp : 1);
      if (it.spice) a *= Math.pow(sp || 1, it.spiceExp != null ? it.spiceExp : 1);
      num = a;
      if (it.unit === "count" || it.unit === "sprig") {
        var n = Math.max(1, Math.round(a));
        q = String(n); num = n;
        if (it.unit === "sprig") label = (n === 1 ? "sprig " : "sprigs ") + label;
        else if (n > 1 && it.plural) label = it.plural;
      } else if (it.unit === "g") {
        q = fmtGrams(a);
      } else {
        q = volume(a, it.unit);
      }
    }
    return { q: q, label: label, num: num, unit: unit };
  }
  window.RecipeKit = { ingQty: ingQty, volume: volume, fmtGrams: fmtGrams, fmtWeight: fmtWeight, fmtMin: fmtMin, frac: frac, esc: esc, LB: LB };
  if (!R) return;
  var scale = R.scale; // { type: "weight", label, baseGrams, defaultUnit, defaultValue } or { type: "servings", base }
  var storeKey = "jr-" + R.slug;

  // ---------- build page shell ----------
  document.title = R.title + " – Jagadish & Manju's Kitchen";
  var root = document.getElementById("recipe");
  var isWeight = scale.type === "weight";
  root.innerHTML =
    (R.image
      ? "<header class='rhero'><img src='" + esc(R.image) + "' alt='" + esc(R.title) + "' width='1600' height='1000' fetchpriority='high'>" +
        "<div class='rhero-text'>" + (R.native ? "<div class='native'>" + esc(R.native) + "</div>" : "") +
        "<h1>" + esc(R.title) + "</h1>" + (R.author ? "<div class='byline'>By " + esc(R.author) + "</div>" : "") +
        "</div></header><p class='lede'>" + esc(R.intro || "") + "</p>"
      : "<header>" + (R.native ? "<div class='native'>" + esc(R.native) + "</div>" : "") +
        "<h1>" + esc(R.title) + "</h1>" +
        (R.author ? "<div class='byline'>By " + esc(R.author) + "</div>" : "") + "<p class='lede'>" + esc(R.intro || "") + "</p></header>") +
    "<div class='rating' id='rating' hidden></div>" +
    "<div class='actions'><button type='button' class='btn' id='cookbtn'>👩‍🍳 Cook mode</button>" +
      "<button type='button' class='btn ghost' id='listbtn'>🛒 Add to shopping list</button>" +
      "<button type='button' class='btn ghost' id='printbtn'>🖨 Print</button></div>" +
    "<section class='card scaler' aria-label='Recipe scaler'>" +
      "<label class='title' for='amt'>" + esc(scale.label || (isWeight ? "How much do you have?" : "How many servings?")) + "</label>" +
      "<div class='row'><input id='amt' type='number' inputmode='decimal' min='0.1' step='" + (isWeight ? "0.1" : (scale.step || 1)) + "'>" + (!isWeight && scale.unitLabel ? "<span class='unitlbl'>" + esc(scale.unitLabel) + "</span>" : "") +
      (isWeight ? "<div class='seg' role='group' aria-label='Unit'><button type='button' data-unit='lb'>lb</button><button type='button' data-unit='kg'>kg</button></div>" : "") +
      "</div>" +
      (isWeight && scale.servingsInput ? "<div class='row srvrow'><label for='srv'>Cooking for</label>" +
        "<input id='srv' type='number' inputmode='numeric' min='1' step='1'><span>people</span></div>" +
        "<div class='srvhint' id='srvhint'></div>" : "") +
      (R.spiceLevels ? "<div class='spice'><span>Heat</span><div class='seg' role='group' aria-label='Spice level'>" +
        "<button type='button' data-spice='0.75'>Mild</button><button type='button' data-spice='1'>Medium</button><button type='button' data-spice='1.35'>Hot</button></div></div>" : "") +
      "<div class='stats'>" + (isWeight && !scale.servingsInput ? "<div>Serves <b id='serves'></b></div>" : "") +
      "<div>Total time <b id='total'></b></div>" + (R.pots ? "<div>Pot <b id='pot'></b></div>" : "") + "</div>" +
      "<div class='warn' id='warn'></div>" +
    "</section>" +
    (R.nutrition ? (function (n) {
      var good = n.goodFatPct, cells = [["protein", "g", "Protein"], ["carbs", "g", "Carbs"], ["fiber", "g", "Fiber"], ["netCarbs", "g", "Net carbs"], ["addedSugar", "g", "Added sugar"], ["fat", "g", "Fat"], ["kcal", "", "kcal"]];
      return "<section class='card nutri' aria-label='Nutrition per " + esc(n.per || "serving") + "'><h2>Per " + esc(n.per || "serving") + " <span class='note' style='display:inline'>(approx.)</span></h2><div class='macros'>" +
        cells.map(function (m) {
          return n[m[0]] == null ? "" : "<div class='m m-" + m[0] + "'><b>" + n[m[0]] + m[1] + "</b><span>" + m[2] + "</span></div>";
        }).join("") + "</div>" +
        (good != null ? "<div class='fatq'><div class='fatq-bar' role='img' aria-label='Fat: " + good + "% good, " + (100 - good) + "% bad'>" +
          "<span class='good' style='width:" + good + "%'></span><span class='bad' style='width:" + (100 - good) + "%'></span></div>" +
          "<div class='fatq-legend'><span class='good'>Good fat " + good + "%</span><span class='bad'>Bad fat " + (100 - good) + "%" + (n.badFat != null ? " (" + n.badFat + "g)" : "") + "</span></div></div>" : "") +
        (n.note ? "<p class='note'>" + n.note + "</p>" : "") + "</section>";
    })(R.nutrition) : "") +
    "<section class='card'><h2>Ingredients</h2><p class='note' style='margin:-6px 0 6px'>Tap an item to tick it off.</p><div id='ingredients'></div></section>" +
    "<section class='card'><h2>Method</h2><p class='note' style='margin:-6px 0 6px'>Tap a step's number to mark it done.</p><ol class='steps' id='steps'></ol></section>" +
    (R.tips && R.tips.length ? "<section class='card'><h2>Tips</h2><ul class='tips' id='tips'></ul></section>" : "") +
    "<section class='card ask' id='ask' aria-label='Ask about this recipe'><h2>Ask about this recipe</h2>" +
      "<p class='note'>Stuck on a step? Ask anything, like substitutes, spice, gravy thickness or storing. Answers use your current quantities.</p>" +
      "<div class='ask-log' id='asklog' aria-live='polite'></div>" +
      "<div class='ask-chips' id='askchips'></div>" +
      "<form class='ask-form' id='askform'><input id='askq' type='text' maxlength='400' autocomplete='off' placeholder='e.g. Is my gravy too thick?' aria-label='Your question'>" +
      "<button class='btn' type='submit' id='asksend'>Ask</button></form>" +
      "<p class='note ask-foot'>AI answers can be wrong, so use your judgement, especially about food safety.</p></section>" +
    "<section class='card made' id='made' aria-label='Rate this recipe'><h2>Made it?</h2>" +
      "<p class='note'>Tap the stars to rate it. It helps other cooks pick a recipe.</p>" +
      "<div class='stars' id='stars' role='radiogroup' aria-label='Your rating'>" +
      [1, 2, 3, 4, 5].map(function (n) { return "<button type='button' role='radio' aria-checked='false' data-star='" + n + "' aria-label='" + n + " star" + (n > 1 ? "s" : "") + "'>★</button>"; }).join("") +
      "</div><p class='note' id='ratemsg' aria-live='polite'></p></section>" +
    (R.serveWith ? "<footer>" + esc(R.serveWith) + "</footer>" : "") +
    "<nav class='endnav' aria-label='Page navigation'><a class='btn' id='endback' href='/'>← All recipes</a>" +
      "<button type='button' class='btn ghost' id='share'>Share recipe</button>" +
      "<a class='btn ghost' href='#' id='totop'>↑ Back to top</a></nav>";

  // back link goes to the recipe's menu on the home page
  var MENUS = { weekday: "Weekday recipes", weekend: "Weekend recipes", festival: "Festival recipes", kids: "Kids recipes" };
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
  // One conversation per page, shared by the box at the bottom, the "Ask" on each step and the
  // Ask sheet in cook mode. askAt.step says which step the cook is on, so answers fit that moment.
  var askAt = { step: null };
  var askChat = (function () {
    var history = [], busy = false;
    var defaults = R.menu === "festival"
      ? ["How do I know the oil is at the right temperature?", "How long will these keep?", "What can I substitute if I'm missing something?"]
      : ["How can I make it less spicy?", "What can I substitute if I'm missing something?", "How do I store and reheat leftovers?"];
    var ideas = (R.askIdeas || []).concat(defaults).slice(0, 3);
    function fmt(t) {
      return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^\s*[-*•]\s+/gm, "• ").replace(/\n/g, "<br>");
    }
    function context() {
      var amt = document.getElementById("amt").value, unit = isWeight ? " " + state.unit : (scale.unitLabel ? " " + scale.unitLabel : " servings");
      var heat = R.spiceLevels ? (state.spice < 1 ? "Mild" : state.spice > 1 ? "Hot" : "Medium") : "";
      var n = R.steps.length, at = askAt.step;
      var where = at == null ? "" : at >= n ? "\nThe cook has finished all the steps and is serving or storing the dish."
        : "\nThe cook is on step " + (at + 1) + " of " + n + " (" + R.steps[at].t + "). Assume the question is about this step unless it clearly isn't.";
      var srv = document.getElementById("srv"), ppl = srv && parseFloat(srv.value) > 0 ? ", for " + srv.value + " people" : "";
      return "Recipe: " + R.title + (R.native ? " (" + R.native + ")" : "") + "\nCooking: " + amt + unit + ppl + (heat ? ", heat " + heat : "") + where +
        "\n\nINGREDIENTS\n" + document.getElementById("ingredients").innerText +
        "\n\nMETHOD\n" + document.getElementById("steps").innerText.replace(/▶ Start [^\n]+ timer/g, "").replace(/ ?💬 Ask about this step/g, "") +
        (document.getElementById("tips") ? "\n\nTIPS\n" + document.getElementById("tips").innerText : "");
    }
    var logs = [], uis = [];
    function setBusy(b) { busy = b; uis.forEach(function (u) { u.send.disabled = b; }); }
    function post(html, cls) {
      var nodes = logs.map(function (l) { var d = document.createElement("div"); d.className = "msg " + cls; d.innerHTML = html; l.appendChild(d); l.scrollTop = l.scrollHeight; return d; });
      return { set: function (h, c) { nodes.forEach(function (d) { d.className = "msg " + c; d.innerHTML = h; d.parentNode.scrollTop = d.parentNode.scrollHeight; }); } };
    }
    // Wire up one question box: { log, form, input, send, chips, ideas? }
    function attach(ui) {
      logs.push(ui.log); uis.push(ui);
      ui.setIdeas = function (list) {
        ui.chips.innerHTML = list.map(function (q) { return "<button type='button' class='chip ask-idea'>" + esc(q) + "</button>"; }).join("");
        ui.chips.style.display = "";
      };
      ui.setIdeas(ui.ideas || ideas);
      ui.chips.addEventListener("click", function (e) { var b = e.target.closest(".ask-idea"); if (b) { ui.input.value = b.textContent; ask(ui); } });
      ui.form.addEventListener("submit", function (e) { e.preventDefault(); ask(ui); });
      return ui;
    }
    function ask(ui) {
      var q = ui.input.value.trim();
      if (q.length < 3 || busy) return;
      if (history.length >= 15) { post("That's the limit for this page. Reload the page to start a new conversation.", "bot"); return; }
      ui.input.value = ""; setBusy(true); ui.chips.style.display = "none";
      var tag = askAt.step != null && askAt.step < R.steps.length ? "<span class='msg-step'>Step " + (askAt.step + 1) + "</span>" : "";
      post(tag + esc(q), "me");
      var bubble = post("Thinking…", "bot thinking");
      fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, recipe: context(), slug: R.slug, history: history }) })
        .then(function (r) { return r.json().catch(function () { return { error: "unavailable" }; }); })
        .then(function (d) {
          if (d.answer) { bubble.set(fmt(d.answer), "bot"); history.push({ q: q, a: d.answer }); return; }
          bubble.set(esc(({
            not_configured: "The recipe assistant isn't switched on yet. Please check back soon.",
            rate_limited: d.scope === "minute" ? "That's a lot of questions at once. Please wait a minute and try again."
                        : d.scope === "site" ? "The assistant has had a busy day. Please try again tomorrow."
                        : "You've reached today's limit for questions. Please try again tomorrow.",
            forbidden: "Please ask from the recipe page on this site.",
            empty: "Please type a question first."
          })[d.error] || "Sorry, I couldn't answer that right now. Please try again in a minute."), "bot");
        })
        .catch(function () { bubble.set("You seem to be offline. Try again when you're connected.", "bot"); })
        .then(function () { setBusy(false); });
    }
    var main = attach({ log: document.getElementById("asklog"), form: document.getElementById("askform"), input: document.getElementById("askq"),
      send: document.getElementById("asksend"), chips: document.getElementById("askchips") });
    function goToBox(step) {
      askAt.step = step;
      main.input.placeholder = step == null ? "e.g. Is my gravy too thick?" : "Your question about step " + (step + 1) + "…";
      document.getElementById("ask").scrollIntoView({ behavior: "smooth" });
      setTimeout(function () { main.input.focus({ preventScroll: true }); }, 450);
    }
    var fab = document.createElement("a");
    fab.href = "#ask"; fab.className = "ask-fab"; fab.textContent = "💬 Ask"; fab.setAttribute("aria-label", "Ask a question about this recipe");
    fab.addEventListener("click", function (e) { e.preventDefault(); goToBox(null); });
    document.body.appendChild(fab);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { fab.classList.toggle("hide", en[0].isIntersecting); }).observe(document.getElementById("ask"));
    // "Ask about this step" buttons in the method list (the list is redrawn when amounts change)
    document.getElementById("steps").addEventListener("click", function (e) {
      var b = e.target.closest(".step-ask"); if (b) goToBox(parseInt(b.dataset.i, 10));
    });
    return { attach: attach };
  })();

  document.getElementById("totop").addEventListener("click", function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); });

  // ---------- steps marked done (kept until the tab is closed) ----------
  var doneKey = "done:" + R.slug, doneSteps = {};
  try { doneSteps = JSON.parse(sessionStorage.getItem(doneKey) || "{}") || {}; } catch (e) {}

  // ---------- cook mode: one step at a time, big text, screen stays on ----------
  var cook = { open: false, i: 0, steps: [] };
  (function () {
    var ov = document.createElement("div");
    ov.className = "cook"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Cook mode"); ov.hidden = true;
    ov.innerHTML = "<div class='cook-top'><span id='cookpos'></span><span class='cook-tools'><button type='button' class='cook-ask' id='cookask' aria-haspopup='dialog' aria-controls='cooksheet'>💬 Ask</button>" +
      "<button type='button' class='cook-x' id='cookx' aria-label='Close cook mode'>✕</button></span></div>" +
      "<div class='cook-bar' id='cookbar' role='group' aria-label='Steps'></div>" +
      "<div class='cook-body' id='cookbody' aria-live='polite'></div>" +
      "<div class='cook-nav'><button type='button' class='btn ghost' id='cookprev'>← Back</button><button type='button' class='btn' id='cooknext'>Next →</button></div>" +
      "<div class='cook-sheet' id='cooksheet' role='dialog' aria-label='Ask about this step' hidden>" +
        "<div class='cook-sheet-top'><b id='cooksheett'>Ask about this step</b><button type='button' class='cook-x' id='cooksheetx' aria-label='Close questions'>✕</button></div>" +
        "<div class='ask-log' id='cooklog' aria-live='polite'></div>" +
        "<div class='ask-chips' id='cookchips'></div>" +
        "<form class='ask-form' id='cookform'><input id='cookq' type='text' maxlength='400' autocomplete='off' placeholder='Ask anything about this step' aria-label='Your question'>" +
        "<button class='btn' type='submit' id='cooksend'>Ask</button></form>" +
        "<p class='note ask-foot'>AI answers can be wrong, so use your judgement, especially about food safety.</p></div>";
    document.body.appendChild(ov);
    var sheet = document.getElementById("cooksheet");
    var cookUi = askChat.attach({ log: document.getElementById("cooklog"), form: document.getElementById("cookform"), input: document.getElementById("cookq"),
      send: document.getElementById("cooksend"), chips: document.getElementById("cookchips"), ideas: [] });
    function stepIdeas() {
      if (cook.i >= cook.steps.length) return ["How do I store and reheat leftovers?", "What goes well with this?", "How long will it keep in the fridge?"];
      var s = cook.steps[cook.i], list = [];
      list.push(s.min >= 3 ? "How do I know this step is done?" : "What should it look like now?");
      list.push("Something went wrong. How do I fix it?");
      list.push(cook.i < cook.steps.length - 1 ? "Can I prepare the next step meanwhile?" : "How long should it rest before serving?");
      return list;
    }
    function openSheet() {
      askAt.step = cook.i;
      document.getElementById("cooksheett").textContent = cook.i >= cook.steps.length ? "Ask about serving" : "Ask about step " + (cook.i + 1);
      cookUi.setIdeas(stepIdeas());
      sheet.hidden = false; ov.classList.add("asking");
      setTimeout(function () { cookUi.input.focus(); }, 50);
    }
    function closeSheet() { sheet.hidden = true; ov.classList.remove("asking"); document.getElementById("cookask").focus(); }
    document.getElementById("cookask").addEventListener("click", function () { if (sheet.hidden) openSheet(); else closeSheet(); });
    document.getElementById("cooksheetx").addEventListener("click", closeSheet);
    var body = document.getElementById("cookbody"), key = "cookstep:" + R.slug;
    cook.draw = function () {
      var n = cook.steps.length; if (!n) return;
      cook.i = Math.max(0, Math.min(n, cook.i));
      // One segment per step: green = done, yellow = current, red = not done yet. Tap one to jump to it.
      var bar = document.getElementById("cookbar"), segs = "";
      for (var k = 0; k < n; k++) {
        var st = k === cook.i ? "cur" : doneSteps[k] ? "done" : "todo";
        segs += "<button type='button' class='seg-" + st + "' data-k='" + k + "' aria-label='Step " + (k + 1) + ": " +
          (st === "cur" ? "current" : st === "done" ? "done" : "not done") + "'></button>";
      }
      bar.innerHTML = segs;
      document.getElementById("cookprev").disabled = cook.i === 0;
      var next = document.getElementById("cooknext");
      if (cook.i >= n) {
        document.getElementById("cookpos").textContent = "Done";
        body.innerHTML = "<div class='cook-done'><div class='big'>🎉</div><h2>Enjoy your " + esc(R.title) + "!</h2>" +
          (R.serveWith ? "<p>" + esc(R.serveWith) + "</p>" : "") + "<p>Rate it below so others know how it turned out.</p></div>";
        next.textContent = "Finish"; return;
      }
      var s = cook.steps[cook.i];
      var isDone = !!doneSteps[cook.i];
      document.getElementById("cookpos").textContent = "Step " + (cook.i + 1) + " of " + n + (isDone ? " · ✓ done" : "");
      var prev = "";
      if (cook.i > 0) {
        var pd = !!doneSteps[cook.i - 1];
        prev = "<button type='button' class='cook-prev" + (pd ? " ok" : "") + "' id='cookprevstep'>" +
          (pd ? "✓ Step " + cook.i + " completed" : "Step " + cook.i + " not marked done") + " · " + esc(cook.steps[cook.i - 1].t) + "</button>";
      }
      body.innerHTML = prev + "<h2>" + esc(s.t) + "</h2><div class='cook-text'>" + s.html + "</div>" +
        "<div class='cook-row'><button class='timer big' data-i='" + cook.i + "' data-sec='" + s.sec + "'>▶ Start " + fmtMin(s.min) + " timer</button>" +
        "<button type='button' class='cook-mark" + (isDone ? " on" : "") + "' id='cookmark'>" + (isDone ? "✓ Done · undo" : "✓ Mark done") + "</button></div>" +
        "<div class='cook-extra'><span>Need more time?</span>" + [1, 2, 4, 5].map(function (m) {
          return "<button type='button' data-add='" + m + "'>+" + m + " min</button>"; }).join("") + "</div>";
      body.querySelector(".timer").addEventListener("click", toggleTimer);
      // Extra time: adds to this step's running timer, or starts a new one for just the extra minutes.
      body.querySelector(".cook-extra").addEventListener("click", function (e) {
        var b = e.target.closest("[data-add]"); if (!b) return;
        var i = String(cook.i), add = parseInt(b.dataset.add, 10) * 60000, now = Date.now(), t = T[i];
        if (t && !t.done) t.end += add; else T[i] = { end: now + add };
        unlockAudio(); saveTimers(); tickTimers();
        b.classList.add("added"); setTimeout(function () { b.classList.remove("added"); }, 600);
      });
      if (prev) document.getElementById("cookprevstep").addEventListener("click", function () { cook.i -= 1; cook.draw(); });
      document.getElementById("cookmark").addEventListener("click", function () {
        var i = cook.i;
        if (doneSteps[i]) { delete doneSteps[i]; try { sessionStorage.setItem(doneKey, JSON.stringify(doneSteps)); } catch (e) {} cook.draw(); return; }
        // Done already (e.g. used ready-made birista): stop this step's timer and move on.
        if (T[i] && !T[i].done) { delete T[i]; saveTimers(); }
        go(1);
      });
      next.textContent = cook.i === n - 1 ? "Finish →" : "Next →";
      try { localStorage.setItem(key, String(cook.i)); } catch (e) {}
      tickTimers();
    };
    function go(d) {
      if (!sheet.hidden) closeSheet();
      if (d > 0 && cook.i < cook.steps.length) { doneSteps[cook.i] = true; try { sessionStorage.setItem(doneKey, JSON.stringify(doneSteps)); } catch (e) {} }
      if (d > 0 && cook.i >= cook.steps.length) { close(); document.getElementById("made").scrollIntoView({ behavior: "smooth" }); return; }
      cook.i += d; cook.draw();
    }
    function open() {
      var saved = parseInt(localStorage.getItem(key) || "0", 10);
      cook.i = saved > 0 && saved < cook.steps.length ? saved : 0;
      cook.open = true; ov.hidden = false; document.documentElement.classList.add("cooking");
      cook.draw(); keepAwake(true, true);
      document.getElementById("cooknext").focus();
    }
    function close() {
      cook.open = false; ov.hidden = true; document.documentElement.classList.remove("cooking");
      sheet.hidden = true; ov.classList.remove("asking"); askAt.step = null;
      keepAwake(hasRunning()); render();
    }
    document.getElementById("cookbtn").addEventListener("click", open);
    document.getElementById("cookx").addEventListener("click", close);
    document.getElementById("cookbar").addEventListener("click", function (e) {
      var b = e.target.closest("[data-k]"); if (!b) return;
      if (!sheet.hidden) closeSheet();
      cook.i = parseInt(b.dataset.k, 10); cook.draw();
    });
    document.getElementById("cookprev").addEventListener("click", function () { go(-1); });
    document.getElementById("cooknext").addEventListener("click", function () { go(1); });
    document.addEventListener("keydown", function (e) {
      if (!cook.open) return;
      if (!sheet.hidden) { if (e.key === "Escape") closeSheet(); return; }
      if (e.target.closest && e.target.closest("input, textarea")) return;
      if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "Escape") close();
    });
    var x0 = null, y0 = null;
    ov.addEventListener("touchstart", function (e) { if (!sheet.hidden) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    ov.addEventListener("touchend", function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    });
  })();

  // ---------- shopping list (saved on this phone, shown at /plan/#list) ----------
  document.getElementById("listbtn").addEventListener("click", function () {
    var btn = this, items = [];
    R.groups.forEach(function (g) { g.items.forEach(function (it) {
      if (/^water$/i.test(it.name) || /^salt$/i.test(it.name)) return;   // everyone has these
      items.push({ name: it._label, q: it._q, base: it.name, unit: it._unit, num: it._num });
    }); });
    var list = [];
    try { list = JSON.parse(localStorage.getItem("shopping") || "[]") || []; } catch (e) {}
    list = list.filter(function (x) { return (x.key || x.slug) !== R.slug; });
    list.push({ key: R.slug, slug: R.slug, title: R.title, amount: document.getElementById("amt").value + (isWeight ? " " + state.unit : ""), items: items, have: {} });
    try { localStorage.setItem("shopping", JSON.stringify(list)); } catch (e) {}
    btn.innerHTML = "✓ Added · <u>view list</u>";
    btn.onclick = function () { location.href = "/plan/#list"; };
  });
  document.getElementById("printbtn").addEventListener("click", function () { window.print(); });

  // ---------- ratings ----------
  (function () {
    var box = document.getElementById("rating"), stars = [].slice.call(document.querySelectorAll("#stars button")), msg = document.getElementById("ratemsg");
    var mine = 0; try { mine = parseInt(localStorage.getItem("rated:" + R.slug) || "0", 10) || 0; } catch (e) {}
    function mark(n) { stars.forEach(function (b) { var on = +b.dataset.star <= n; b.classList.toggle("on", on); b.setAttribute("aria-checked", +b.dataset.star === n); }); }
    function show(d) {
      if (!d || !d.count) { box.hidden = true; return; }
      var full = Math.round(d.avg);
      box.innerHTML = "<span class='rstars' aria-hidden='true'>" + "★★★★★".slice(0, full) + "<i>" + "★★★★★".slice(full) + "</i></span> <b>" + d.avg.toFixed(1) + "</b> · " +
        d.count + " rating" + (d.count > 1 ? "s" : "") + (d.made ? " · " + d.made + " cooked it" : "");
      box.setAttribute("aria-label", "Rated " + d.avg.toFixed(1) + " out of 5 by " + d.count + " cooks");
      box.hidden = false;
    }
    mark(mine);
    if (mine) msg.textContent = "Thanks! You rated this " + mine + " star" + (mine > 1 ? "s" : "") + ".";
    fetch("/api/rate?slug=" + encodeURIComponent(R.slug)).then(function (r) { return r.ok ? r.json() : null; }).then(show).catch(function () {});
    stars.forEach(function (b) {
      b.addEventListener("click", function () {
        var n = +b.dataset.star; mark(n); msg.textContent = "Saving…";
        fetch("/api/rate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: R.slug, stars: n }) })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (d) {
            if (d.error === "not_configured") { msg.textContent = "Ratings aren't switched on yet."; return; }
            if (d.error) { msg.textContent = d.error === "rate_limited" ? "Please try again later." : "Couldn't save that. Please try again."; return; }
            try { localStorage.setItem("rated:" + R.slug, String(n)); } catch (e) {}
            msg.textContent = "Thanks! You rated this " + n + " star" + (n > 1 ? "s" : "") + "."; show(d);
          })
          .catch(function () { msg.textContent = "You seem to be offline. Try again when you're connected."; });
      });
    });
  })();

  // ---------- state ----------
  var state = isWeight ? { unit: scale.defaultUnit || "lb", value: scale.defaultValue, spice: 1 }
                       : { value: scale.base, spice: 1 };
  try {
    var saved = JSON.parse(localStorage.getItem(storeKey) || "null");
    if (saved && saved.value > 0) { for (var k in saved) state[k] = saved[k]; }
  } catch (e) {}
  var $amt = document.getElementById("amt");
  $amt.value = state.value;
  var $srvIn = document.getElementById("srv");
  if ($srvIn) {
    // Older saves had no people count (it used to follow the weight), so start from what the weight implied.
    if (!(state.people > 0)) {
      var g0 = state.unit === "kg" ? state.value * 1000 : state.value * LB;
      state.people = Math.max(1, Math.round(R.baseServings * g0 / scale.baseGrams)) || R.baseServings;
    }
    $srvIn.value = state.people;
  }

  function factor() {
    var v = parseFloat($amt.value);
    if (!(v > 0)) return null;
    if (!isWeight) { var fs = v / scale.base; return { f: fs, g: null, p: fs }; }
    var g = state.unit === "lb" ? v * LB : v * 1000, fw = g / scale.baseGrams, p = fw;
    if ($srvIn) { var n = parseFloat($srvIn.value); if (n > 0) p = n / R.baseServings; }
    return { f: fw, g: g, p: p };
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
    var f = fx.f, pf = fx.p, sp = state.spice, big = Math.max(f, pf);
    warn.style.display = big > 6.5 || f < 0.27 ? "block" : "none";
    warn.textContent = big > 6.5 ? "That's a big batch. Consider cooking it in two pots so it browns properly."
                               : "That's a very small amount. Quantities are rounded, so go by taste.";

    var qty = {}, html = "";
    R.groups.forEach(function (grp) {
      html += "<h3>" + esc(grp.title) + "</h3><ul class='ing'>";
      grp.items.forEach(function (it) {
        var r = ingQty(it, (it.by || grp.by) === "people" ? pf : f, fx.g, scale, sp), q = r.q, label = r.label;
        if (it.id) qty[it.id] = q;
        it._q = q; it._label = label; it._num = r.num; it._unit = r.unit;
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
    if (R.pots) { for (var i = 0; i < R.pots.length; i++) { pot = R.pots[i][1]; if (big <= R.pots[i][0]) break; } }
    var extra = { pot: pot ? "large (" + pot + ")" : "large" };

    var total = R.prepMin || 0, sh = "";
    cook.steps = [];
    R.steps.forEach(function (s, i) {
      var sf = s.by === "people" ? pf : f, m = s.min * Math.pow(sf, s.exp || 0);
      if (!s.parallel) total += m;
      var txt = esc(s.txt).replace(/\{(\w+)\}/g, function (_, k) {
        if (qty[k] != null) return "<span class='q'>" + qty[k] + "</span>";
        return extra[k] != null ? extra[k] : "";
      });
      if (s.bigNote && sf > 1.6) txt += " " + esc(s.bigNote);
      var used = (s.uses || []).map(function (u) {
        var parts = u.split("|"), it = findIng(parts[0]);
        if (!it) return "";
        var short = it._label.split(/,| \(/)[0];
        return "<span class='chip'><b>" + it._q + "</b> " + esc(short) + (parts[1] ? " <i>(" + esc(parts[1]) + ")</i>" : "") + "</span>";
      }).join("");
      if (used) txt += "<div class='uses'><span class='uses-h'>In this step</span>" + used + "</div>";
      cook.steps.push({ t: s.t, min: m, html: txt, sec: Math.round(m * 60) });
      sh += "<li" + (doneSteps[i] ? " class='done'" : "") + "><button type='button' class='stepno' data-step='" + i + "' aria-label='Mark step " + (i + 1) + " done'>" + (i + 1) + "</button><span class='st'>" + esc(s.t) + " · " + fmtMin(m) + "</span>" + txt +
            "<br><button class='timer' data-i='" + i + "' data-sec='" + Math.round(m * 60) + "'>▶ Start " + fmtMin(m) + " timer</button>" +
            " <button type='button' class='step-ask' data-i='" + i + "'>💬 Ask about this step</button></li>";
    });
    document.getElementById("steps").innerHTML = sh;
    document.querySelectorAll("#steps .timer").forEach(function (b) { b.addEventListener("click", toggleTimer); });
    document.querySelectorAll("#steps .stepno").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = b.dataset.step; doneSteps[i] = !doneSteps[i]; if (!doneSteps[i]) delete doneSteps[i];
        b.closest("li").classList.toggle("done", !!doneSteps[i]);
        try { sessionStorage.setItem(doneKey, JSON.stringify(doneSteps)); } catch (e) {}
      });
    });
    if (cook.open) cook.draw();
    tickTimers();

    var srvN = Math.max(1, Math.round(R.baseServings * f));
    if (isWeight && !scale.servingsInput) document.getElementById("serves").textContent = srvN;
    if ($srvIn) srvHint(fx);
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
      if ($srvIn && parseFloat($srvIn.value) > 0) out.people = parseFloat($srvIn.value);
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
    keepAwake(running.length > 0 || cook.open);
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
  // People and weight are separate inputs: changing one never changes the other.
  if ($srvIn) {
    $srvIn.addEventListener("input", function () { if (parseFloat($srvIn.value) > 0) render(); });
    document.getElementById("srvhint").addEventListener("click", function (e) {
      if (!e.target.closest(".srvfit")) return;
      var g = parseFloat($srvIn.value) * scale.baseGrams / R.baseServings;
      $amt.value = state.unit === "lb" ? Math.round(g / LB * 100) / 100 : Math.round(g / 10) / 100;
      render();
    });
  }
  // Under the people box: how much of the main ingredient each person gets, what follows the
  // people count, and a one-tap way to match the weight to the people if they want.
  function srvHint(fx) {
    var n = parseFloat($srvIn.value), box = document.getElementById("srvhint");
    if (!(n > 0)) { box.innerHTML = ""; return; }
    var main = ((R.groups.map(function (g) { return g.items.filter(function (it) { return it.unit === "main"; })[0]; }).filter(Boolean)[0] || {}).name || "").split(/,| \(/)[0];
    var each = fx.g / n, typical = scale.baseGrams / R.baseServings;
    var byPeople = R.groups.filter(function (g) { return g.by === "people"; }).map(function (g) { return g.title.split(" (")[0].toLowerCase(); });
    var html = "≈ <b>" + fmtGrams(each) + "</b> " + esc(main || "per person") + (main ? " per person" : "");
    if (byPeople.length) html += " · " + esc(byPeople.join(" and ").replace(/^./, function (c) { return c.toUpperCase(); })) + " for " + n + (n === 1 ? " person" : " people");
    if (Math.abs(each / typical - 1) > 0.35) {
      var g = n * typical, show = state.unit === "lb" ? (Math.round(g / LB * 100) / 100) + " lb" : (Math.round(g / 10) / 100) + " kg";
      html += "<br><span class='note' style='display:inline'>Usually about " + fmtGrams(typical) + " a person. </span>" +
        "<button type='button' class='srvfit'>Use " + show + " for " + n + "</button>";
    }
    box.innerHTML = html;
  }
  setOn("[data-unit]", "data-unit", state.unit);
  setOn("[data-spice]", "data-spice", state.spice);
  render();
})();
