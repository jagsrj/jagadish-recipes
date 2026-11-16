// /api/rate — star ratings for recipes.
//   GET  /api/rate?slug=chicken-kuzhambu        → { avg, count }
//   GET  /api/rate                              → { slug: { avg, count }, ... } for every rated recipe
//   POST /api/rate  { slug, stars: 1-5 }        → { avg, count }
//
// Needs a KV namespace binding named "RATINGS" (Settings → Bindings → KV namespace).
// Each visitor (by network address) gets one rating per recipe; rating again replaces
// their earlier rating instead of adding a new one. Ratings show on the recipe page and
// in Google's recipe results (the star line under the link).

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, extra)
  });
}
function summary(r) {
  return r && r.count ? { avg: Math.round((r.sum / r.count) * 10) / 10, count: r.count } : { avg: 0, count: 0 };
}
async function known(env, origin, slug) {
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || slug === "_template") return false;
  try {
    const src = await (await env.ASSETS.fetch(new URL("/assets/recipes.js", origin))).text();
    return src.includes(`slug: "${slug}"`);
  } catch (e) { return false; }
}
async function visitor(ip, slug) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("jmk-rate:" + ip + ":" + slug));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet({ request, env }) {
  if (!env.RATINGS) return json({ avg: 0, count: 0 });
  const slug = new URL(request.url).searchParams.get("slug") || "";
  if (!slug) {   // all recipes, for the home page cards
    const out = {}, list = await env.RATINGS.list({ prefix: "r:" });
    await Promise.all(list.keys.map(async (k) => { out[k.name.slice(2)] = summary(await env.RATINGS.get(k.name, "json")); }));
    return json(out, 200, { "cache-control": "public, max-age=300" });
  }
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return json({ error: "bad_request" }, 400);
  const r = await env.RATINGS.get("r:" + slug, "json");
  return json(summary(r), 200, { "cache-control": "public, max-age=60" });
}

export async function onRequestPost({ request, env }) {
  if (!env.RATINGS) return json({ error: "not_configured" }, 503);
  const host = new URL(request.url).host, src = request.headers.get("origin") || request.headers.get("referer") || "";
  try { if (new URL(src).host !== host) return json({ error: "forbidden" }, 403); } catch (e) { return json({ error: "forbidden" }, 403); }

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, 400); }
  const slug = String(body.slug || ""), stars = parseInt(body.stars, 10);
  if (!(stars >= 1 && stars <= 5)) return json({ error: "bad_request" }, 400);
  const origin = new URL(request.url).origin;
  if (!(await known(env, origin, slug))) return json({ error: "unknown_recipe" }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  // Simple flood guard: at most 20 ratings a day from one address across all recipes.
  const dayKey = "d:" + (await visitor(ip, "day")) + ":" + new Date().toISOString().slice(0, 10);
  const today = parseInt((await env.RATINGS.get(dayKey)) || "0", 10);
  if (today >= 20) return json({ error: "rate_limited" }, 429);
  await env.RATINGS.put(dayKey, String(today + 1), { expirationTtl: 90000 });

  const vKey = "v:" + slug + ":" + (await visitor(ip, slug));
  const prev = parseInt((await env.RATINGS.get(vKey)) || "0", 10);
  const r = (await env.RATINGS.get("r:" + slug, "json")) || { sum: 0, count: 0 };
  if (prev) r.sum += stars - prev; else { r.sum += stars; r.count += 1; }
  await env.RATINGS.put("r:" + slug, JSON.stringify(r));
  await env.RATINGS.put(vKey, String(stars), { expirationTtl: 60 * 60 * 24 * 365 });
  return json(summary(r));
}
