/*
 * Weekly planner and shopping list (/plan/).
 * The plan and the list are saved on this phone (localStorage "plan" and "shopping").
 * Recipe pages add to the same list with their "Add to shopping list" button.
 */
(function () {
  "use strict";
  var K = window.RecipeKit, esc = K.esc, all = window.RECIPES || [];
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var MENU_NAME = { weekday: "Weekday · healthy keto", weekend: "Weekend · village style", festival: "Festival", kids: "Kids" };

  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var plan = load("plan", { days: {}, people: 4 });
  var list = load("shopping", []);
  var have = load("shopping-have", {});

  // ---------- tabs ----------
  var tabs = [].slice.call(document.querySelectorAll(".ptabs button"));
  function view(v) {
    tabs.forEach(function (b) { var on = b.dataset.view === v; b.className = on ? "on" : ""; b.setAttribute("aria-selected", on); });
    document.getElementById("planview").hidden = v !== "plan";
    document.getElementById("listview").hidden = v !== "list";
    if (v === "list") { list = load("shopping", []); have = load("shopping-have", {}); drawList(); }
  }
  tabs.forEach(function (b) { b.addEventListener("click", function () { history.replaceState(null, "", "#" + b.dataset.view); view(b.dataset.view); }); });
  window.addEventListener("hashchange", function () { view(location.hash === "#list" ? "list" : "plan"); });

  // ---------- recipes: fetch a page and read its window.RECIPE ----------
  var cache = {};
  function getRecipe(slug) {
    if (cache[slug]) return cache[slug];
    cache[slug] = fetch("/recipes/" + slug + "/").then(function (r) { return r.text(); }).then(function (html) {
      var m = html.match(/<script>\s*(window\.RECIPE\s*=[\s\S]*?)<\/script>/);
      if (!m) throw new Error("no recipe");
      var w = {}; new Function("window", m[1])(w);
      return w.RECIPE;
    });
    return cache[slug];
  }
  // How many "units" a recipe is planned for: people for most recipes, pieces for sweets/snacks.
  function amountInfo(r) {
    // r is the entry from recipes.js; the unit label comes from the recipe page once loaded
    return r.menu === "festival" ? { label: "batch", def: 1 } : { label: "people", def: plan.people || 4 };
  }
  function factorFor(R, n, meta) {
    if (meta.label === "batch") return n;                                  // 1 = the recipe as written
    if (R.scale.type === "weight") return n / R.baseServings;
    return n / (R.scale.base || R.baseServings || 4);
  }

  // ---------- weekly plan ----------
  var daysEl = document.getElementById("days");
  function options(sel, dayIndex) {
    var pref = dayIndex < 5 ? "weekday" : "weekend";
    var order = [pref, pref === "weekday" ? "weekend" : "weekday", "kids", "festival"];
    return "<option value=''>— Nothing planned —</option>" + order.map(function (m) {
      var rs = all.filter(function (r) { return (r.menu || "weekend") === m; });
      return rs.length ? "<optgroup label='" + esc(MENU_NAME[m]) + "'>" + rs.map(function (r) {
        return "<option value='" + esc(r.slug) + "'" + (r.slug === sel ? " selected" : "") + ">" + esc(r.title) + "</option>";
      }).join("") + "</optgroup>" : "";
    }).join("");
  }
  function drawPlan() {
    daysEl.innerHTML = DAYS.map(function (d, i) {
      var p = plan.days[d] || {}, r = all.filter(function (x) { return x.slug === p.slug; })[0];
      var meta = r ? amountInfo(r) : { label: "people", def: plan.people || 4 };
      return "<div class='day'><b>" + d + "<span>" + (i < 5 ? "Weekday" : "Weekend") + "</span></b>" +
        "<div><select data-day='" + d + "' aria-label='Recipe for " + FULL[i] + "'>" + options(p.slug, i) + "</select>" +
        (r ? "<a href='/recipes/" + esc(r.slug) + "/'>Open recipe →</a>" : "") + "</div>" +
        "<div class='amt'><input type='number' min='1' step='1' inputmode='numeric' data-n='" + d + "' value='" + (p.n || meta.def) + "' aria-label='How many for " + FULL[i] + "'" + (r ? "" : " disabled") + "><small>" + meta.label + "</small></div></div>";
    }).join("");
    daysEl.querySelectorAll("select").forEach(function (s) {
      s.addEventListener("change", function () {
        var d = s.dataset.day;
        if (!s.value) delete plan.days[d];
        else { var r = all.filter(function (x) { return x.slug === s.value; })[0]; plan.days[d] = { slug: s.value, n: amountInfo(r).def }; }
        save("plan", plan); drawPlan();
      });
    });
    daysEl.querySelectorAll("input").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var n = parseInt(inp.value, 10), d = inp.dataset.n;
        if (n > 0 && plan.days[d]) { plan.days[d].n = n; if (amountInfo(all.filter(function (x) { return x.slug === plan.days[d].slug; })[0]).label === "people") plan.people = n; save("plan", plan); }
      });
    });
    // weekly protein / carbs / fiber / net carbs from the planned meals (festival snacks are per piece, so left out)
    var meals = DAYS.map(function (d) { return plan.days[d] && all.filter(function (x) { return x.slug === plan.days[d].slug; })[0]; })
      .filter(function (r) { return r && r.nutrition && !r.nutrition.per; });
    var m = document.getElementById("macros");
    if (meals.length) {
      var sum = function (k) { return meals.reduce(function (a, r) { return a + (r.nutrition[k] || 0); }, 0); };
      m.innerHTML = "<span>Per person, across " + meals.length + " meal" + (meals.length > 1 ? "s" : "") + ":</span>" +
        "<span><b>" + sum("protein") + " g</b> protein</span><span><b>" + sum("carbs") + " g</b> carbs</span><span><b>" + sum("fiber") + " g</b> fiber</span><span><b>" + sum("netCarbs") + " g</b> net carbs</span>";
    } else m.innerHTML = "";
  }
  document.getElementById("suggest").addEventListener("click", function () {
    var used = {}; DAYS.forEach(function (d) { if (plan.days[d]) used[plan.days[d].slug] = 1; });
    DAYS.forEach(function (d, i) {
      if (plan.days[d]) return;
      var pool = all.filter(function (r) { return (r.menu || "weekend") === (i < 5 ? "weekday" : "weekend") && !used[r.slug]; });
      if (!pool.length) pool = all.filter(function (r) { return (r.menu || "weekend") === (i < 5 ? "weekday" : "weekend"); });
      if (!pool.length) return;
      var r = pool[Math.floor(Math.random() * pool.length)]; used[r.slug] = 1;
      plan.days[d] = { slug: r.slug, n: amountInfo(r).def };
    });
    save("plan", plan); drawPlan();
  });
  document.getElementById("clearplan").addEventListener("click", function () { plan.days = {}; save("plan", plan); drawPlan(); });

  document.getElementById("tolist").addEventListener("click", function () {
    var btn = this, msg = document.getElementById("planmsg");
    var picks = DAYS.map(function (d) { return plan.days[d] ? { day: d, slug: plan.days[d].slug, n: plan.days[d].n } : null; }).filter(Boolean);
    if (!picks.length) { msg.textContent = "Pick at least one recipe first."; return; }
    btn.disabled = true; msg.textContent = "Working out the amounts…";
    Promise.all(picks.map(function (p) { return getRecipe(p.slug).then(function (R) { return { p: p, R: R }; }); })).then(function (rows) {
      list = load("shopping", []);
      rows.forEach(function (row) {
        var R = row.R, p = row.p, meta = amountInfo(all.filter(function (x) { return x.slug === p.slug; })[0]);
        var f = factorFor(R, p.n, meta), g = R.scale.type === "weight" ? R.scale.baseGrams * f : null, items = [];
        R.groups.forEach(function (grp) { grp.items.forEach(function (it) {
          if (/^(water|salt)$/i.test(it.name)) return;
          var q = K.ingQty(it, f, g, R.scale, 1);
          items.push({ name: q.label, q: q.q, base: it.name, unit: q.unit, num: q.num });
        }); });
        var key = R.slug + ":" + p.day;
        list = list.filter(function (x) { return (x.key || x.slug) !== key; });
        list.push({ key: key, slug: R.slug, title: R.title + " (" + p.day + ")", amount: p.n + " " + meta.label, items: items });
      });
      save("shopping", list);
      msg.textContent = "";
      location.hash = "#list";
    }).catch(function () { msg.textContent = "Couldn't load the recipes. Check your connection and try again."; })
      .then(function () { btn.disabled = false; });
  });

  // ---------- shopping list ----------
  // Same ingredient + same unit across recipes is added together.
  function combine() {
    var map = {}, order = [];
    list.forEach(function (src) {
      src.items.forEach(function (it) {
        var key = (it.base || it.name).toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").trim() + "|" + it.unit;
        if (!map[key]) { map[key] = { key: key, name: it.name, unit: it.unit, num: 0, qs: [], from: [], ok: true }; order.push(key); }
        var e = map[key];
        if (typeof it.num === "number" && isFinite(it.num)) e.num += it.num; else e.ok = false;
        e.qs.push(it.q); if (e.from.indexOf(src.title) < 0) e.from.push(src.title);
        if ((it.unit === "count" || it.unit === "sprig") && it.num > 1) e.name = it.name;   // plural label
      });
    });
    return order.map(function (k) {
      var e = map[k], q;
      if (!e.ok || e.qs.length === 1) q = e.qs.join(" + ");
      else if (e.unit === "g") q = e.num >= 300 ? K.fmtWeight(e.num) : K.fmtGrams(e.num);
      else if (e.unit === "count") q = String(Math.round(e.num));
      else if (e.unit === "sprig") { q = String(Math.round(e.num)); e.name = e.name.replace(/^sprigs? /, Math.round(e.num) === 1 ? "sprig " : "sprigs "); }
      else if (/^(tsp|tbsp|cup)$/.test(e.unit)) q = K.volume(e.num, e.unit);
      else q = e.qs.join(" + ");
      return { key: e.key, q: q, name: e.name, from: e.from };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function drawList() {
    var rows = combine(), shop = document.getElementById("shop"), src = document.getElementById("sources");
    src.innerHTML = list.map(function (s, i) {
      return "<span class='chip'><b>" + esc(s.title) + "</b> " + esc(s.amount || "") + "<button type='button' data-rm='" + i + "' aria-label='Remove " + esc(s.title) + "'>✕</button></span>";
    }).join("");
    src.querySelectorAll("[data-rm]").forEach(function (b) {
      b.addEventListener("click", function () { list.splice(+b.dataset.rm, 1); save("shopping", list); drawList(); });
    });
    shop.innerHTML = rows.length ? rows.map(function (r) {
      var on = !!have[r.key];
      return "<li class='" + (on ? "have" : "") + "' data-k='" + esc(r.key) + "'><input type='checkbox'" + (on ? " checked" : "") + " aria-label='" + esc(r.name) + "'>" +
        "<span class='qty'>" + esc(r.q) + "</span><span>" + esc(r.name) + (list.length > 1 ? "<span class='from'>" + esc(r.from.join(", ")) + "</span>" : "") + "</span></li>";
    }).join("") : "<li class='empty-list'>Your list is empty. Add recipes from the weekly plan, or tap “Add to shopping list” on any recipe.</li>";
    shop.querySelectorAll("li[data-k]").forEach(function (li) {
      li.addEventListener("click", function (e) {
        var k = li.dataset.k; have[k] = !have[k]; if (!have[k]) delete have[k];
        li.classList.toggle("have", !!have[k]); li.querySelector("input").checked = !!have[k];
        if (e.target.tagName === "INPUT") e.target.checked = !!have[k];
        save("shopping-have", have); count(rows);
      });
    });
    count(rows);
  }
  function count(rows) {
    rows = rows || combine();
    var left = rows.filter(function (r) { return !have[r.key]; }).length;
    document.getElementById("listcount").textContent = rows.length ? left + " of " + rows.length + " to buy" : "Nothing yet";
  }
  document.getElementById("cleardone").addEventListener("click", function () {
    // drop ticked items from every recipe on the list
    list.forEach(function (s) {
      s.items = s.items.filter(function (it) {
        var key = (it.base || it.name).toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").trim() + "|" + it.unit;
        return !have[key];
      });
    });
    list = list.filter(function (s) { return s.items.length; });
    have = {}; save("shopping", list); save("shopping-have", have); drawList();
  });
  document.getElementById("clearall").addEventListener("click", function () {
    if (!list.length) return;
    list = []; have = {}; save("shopping", list); save("shopping-have", have); drawList();
  });
  document.getElementById("sharelist").addEventListener("click", function () {
    var btn = this, rows = combine().filter(function (r) { return !have[r.key]; });
    var text = "Shopping list – Jagadish & Manju's Kitchen\n" + rows.map(function (r) { return "☐ " + r.q + " " + r.name; }).join("\n");
    if (navigator.share) { navigator.share({ title: "Shopping list", text: text }).catch(function () {}); return; }
    var done = function () { btn.textContent = "Copied ✓"; setTimeout(function () { btn.textContent = "Share list"; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { prompt("Copy your list:", text); });
    else prompt("Copy your list:", text);
  });

  drawPlan();
  view(location.hash === "#list" ? "list" : "plan");
})();
