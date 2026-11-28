// "Find my recipe" quiz on the home page. Four quick questions, then the best matches
// from assets/recipes.js, scored from each entry's menu, tags, time and nutrition.
// Nothing new to fill in when you add a recipe: it is picked up automatically.
// Opens from the ✨ button or a link to /#quiz.
(function () {
  var J = window.JMK;
  if (!J) return;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function tags(r) { return (r.tags || []).join(" ").toLowerCase(); }
  function hasAny(r, words) { var t = tags(r); return words.some(function (w) { return t.indexOf(w) > -1; }); }

  var MOOD = {
    chicken: ["chicken"], seafood: ["seafood", "fish", "crab", "prawn"], mutton: ["mutton", "goat"],
    egg: ["egg"], veg: ["vegetarian", "paneer"], sweet: ["sweet", "dessert", "laddu"], savoury: ["snack"]
  };

  var QUESTIONS = [
    { key: "menu", q: "What are you cooking for?", opts: [
      ["weekday", "🥗", "A healthy weekday meal"], ["weekend", "🍛", "A weekend feast"],
      ["festival", "🪔", "Festival sweets & snacks"], ["kids", "🧒", "Something kids will eat"], ["any", "🎲", "Surprise me"] ] },
    { key: "mood", q: function (a) { return a.menu === "festival" ? "Sweet or savoury?" : "What are you in the mood for?"; },
      opts: function (a) {
        return a.menu === "festival"
          ? [["sweet", "🍯", "Something sweet"], ["savoury", "🌀", "Something crunchy & savoury"], ["any", "🤷", "Either"]]
          : [["chicken", "🍗", "Chicken"], ["seafood", "🐟", "Fish or seafood"], ["mutton", "🍖", "Mutton"],
             ["egg", "🍳", "Eggs"], ["veg", "🧀", "Vegetarian"], ["any", "🤷", "Anything"]];
      } },
    { key: "time", q: "How much time do you have?", opts: [
      ["30", "⚡", "30 minutes or less"], ["60", "⏱", "Up to an hour"], ["120", "🕑", "A couple of hours"], ["any", "☀️", "All day, no rush"] ] },
    { key: "goal", q: "What matters most today?", skip: function (a) { return a.menu === "festival" || a.menu === "kids"; }, opts: [
      ["protein", "💪", "Lots of protein"], ["lowcarb", "🥦", "Low carb"], ["fiber", "🌾", "More fibre"], ["taste", "😋", "Just tasty"] ] }
  ];

  // Score one recipe against the answers. Returns { score, why[] }.
  function score(r, a) {
    var s = 0, why = [], n = r.nutrition || {}, mins = J.minutes(r.time), menu = r.menu || "weekend";
    if (a.menu && a.menu !== "any") { if (menu === a.menu) s += 6; else s -= 6; }
    if (a.mood && a.mood !== "any") {
      if (hasAny(r, MOOD[a.mood] || [])) { s += 6; } else s -= 8;
    }
    if (a.time && a.time !== "any" && mins) {
      var lim = +a.time;
      if (mins <= lim) { s += 3; why.push("ready in " + r.time); } else s -= Math.min(6, Math.ceil((mins - lim) / 30) * 2);
    }
    if (a.goal === "protein" && n.protein) { s += n.protein >= 30 ? 3 : n.protein >= 20 ? 1 : -1; if (n.protein >= 25) why.push(n.protein + " g protein"); }
    if (a.goal === "lowcarb" && n.netCarbs != null) { s += n.netCarbs <= 12 ? 3 : n.netCarbs <= 20 ? 1 : -2; if (n.netCarbs <= 20) why.push("only " + n.netCarbs + " g net carbs"); }
    if (a.goal === "fiber" && n.fiber != null) { s += n.fiber >= 6 ? 3 : n.fiber >= 5 ? 1 : -1; if (n.fiber >= 5) why.push(n.fiber + " g fibre"); }
    if (a.goal === "taste" && r.featured) { s += 1; why.push("our Chef's special"); }
    if (window.JMK_RATINGS && window.JMK_RATINGS[r.slug] && window.JMK_RATINGS[r.slug].avg >= 4.5) { s += 1; why.push("rated " + window.JMK_RATINGS[r.slug].avg.toFixed(1) + "★"); }
    return { score: s, why: why };
  }

  // ---------- dialog ----------
  var ov = document.createElement("div");
  ov.className = "quiz"; ov.hidden = true;
  ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Find my recipe");
  ov.innerHTML = "<div class='quiz-panel'><div class='quiz-top'><button type='button' class='quiz-back' aria-label='Back'>←</button>" +
    "<div class='quiz-bar'><span></span></div><button type='button' class='quiz-x' aria-label='Close'>✕</button></div><div class='quiz-body'></div></div>";
  document.body.appendChild(ov);
  var body = ov.querySelector(".quiz-body"), bar = ov.querySelector(".quiz-bar span"), backBtn = ov.querySelector(".quiz-back");
  var answers = {}, step = 0, results = [], hidden = {}, lastFocus = null;

  function steps() { return QUESTIONS.filter(function (q) { return !(q.skip && q.skip(answers)); }); }
  function val(x) { return typeof x === "function" ? x(answers) : x; }

  function showQuestion() {
    var list = steps(), Q = list[step];
    if (!Q) return showResults();
    bar.style.width = Math.round(step / list.length * 100) + "%";
    backBtn.style.visibility = step ? "visible" : "hidden";
    body.innerHTML = "<p class='quiz-count'>Question " + (step + 1) + " of " + list.length + "</p><h2>" + esc(val(Q.q)) + "</h2><div class='quiz-opts'>" +
      val(Q.opts).map(function (o) {
        return "<button type='button' data-v='" + esc(o[0]) + "'" + (answers[Q.key] === o[0] ? " class='on'" : "") + "><span>" + o[1] + "</span>" + esc(o[2]) + "</button>";
      }).join("") + "</div>";
    [].slice.call(body.querySelectorAll(".quiz-opts button")).forEach(function (b) {
      b.addEventListener("click", function () {
        answers[Q.key] = b.getAttribute("data-v");
        if (Q.key === "menu") { delete answers.mood; delete answers.goal; }   // the next questions depend on this one
        step++; showQuestion();
      });
    });
    var first = body.querySelector(".quiz-opts button.on") || body.querySelector(".quiz-opts button");
    if (first) first.focus();
  }

  function showResults() {
    bar.style.width = "100%";
    backBtn.style.visibility = "visible";
    results = J.all().map(function (r) { var x = score(r, answers); return { r: r, score: x.score, why: x.why }; })
      .sort(function (a, b) { return b.score - a.score; });
    hidden = {};
    drawResults();
  }

  function drawResults() {
    var left = results.filter(function (x) { return !hidden[x.r.slug]; });
    var top = left.slice(0, 3);
    var good = top.length && top[0].score > 0;
    body.innerHTML = "<h2>" + (good ? "Try these tonight" : "Closest matches") + "</h2>" +
      "<p class='quiz-sub'>" + (good ? "Picked from what you told us. Tap ♡ to save, or swap any you don't fancy."
        : "We don't have an exact match yet, so here's what comes closest. More recipes are on the way.") + "</p>" +
      "<div class='quiz-results'>" + top.map(function (x) {
        return "<div class='quiz-pick'>" + (x.why.length ? "<div class='quiz-why'>✓ " + esc(x.why.join(" · ")) + "</div>" : "") + J.card(x.r) +
          "<button type='button' class='btn ghost quiz-nope' data-nope='" + esc(x.r.slug) + "'" + (left.length <= 3 ? " disabled" : "") + ">✕ Not for me, show another</button></div>";
      }).join("") + "</div>" +
      "<div class='quiz-end'><button type='button' class='btn ghost' id='quizagain'>↺ Start over</button><button type='button' class='btn' id='quizdone'>Done</button></div>";
    [].slice.call(body.querySelectorAll("[data-nope]")).forEach(function (b) {
      b.addEventListener("click", function () { hidden[b.getAttribute("data-nope")] = true; drawResults(); });
    });
    document.getElementById("quizagain").addEventListener("click", function () { answers = {}; step = 0; showQuestion(); });
    document.getElementById("quizdone").addEventListener("click", close);
    body.scrollTop = 0;
  }

  function open() {
    lastFocus = document.activeElement;
    answers = {}; step = 0;
    ov.hidden = false; document.body.classList.add("noscroll");
    if (location.hash !== "#quiz") history.replaceState(null, "", "#quiz");
    showQuestion();
  }
  function close() {
    ov.hidden = true; document.body.classList.remove("noscroll");
    if (location.hash === "#quiz") history.replaceState(null, "", location.pathname);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  backBtn.addEventListener("click", function () { if (step > 0) { step--; showQuestion(); } });
  ov.querySelector(".quiz-x").addEventListener("click", close);
  ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !ov.hidden) close(); });
  document.getElementById("quizbtn").addEventListener("click", open);
  if (location.hash === "#quiz") open();
})();
