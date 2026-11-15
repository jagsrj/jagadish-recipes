// /sitemap.xml — built from assets/recipes.js, so every new recipe is listed automatically.
export async function onRequest(context) {
  const origin = new URL(context.request.url).origin;
  const res = await context.env.ASSETS.fetch(new URL("/assets/recipes.js", origin));
  const src = res.ok ? await res.text() : "";
  const slugs = [...src.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
  const urls = ["/"].concat(slugs.map((s) => "/recipes/" + s + "/"));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => "  <url><loc>" + origin + u + "</loc></url>").join("\n") +
    "\n</urlset>\n";
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
