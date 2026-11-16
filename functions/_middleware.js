// Runs on Cloudflare Pages for every request. For HTML pages it:
//  - adds a canonical link and turns "/images/..." links into full URLs (Google and WhatsApp previews need full URLs)
//  - on recipe pages, writes the ingredients and method into the page as plain HTML, so search engines and
//    link previews see the recipe even before JavaScript runs (the recipe engine replaces it when the page loads)
//  - on recipe pages, adds the star rating to the Google recipe data once someone has rated it (needs the RATINGS KV binding)
// It works out the site's address from the request, so it keeps working on *.pages.dev and on a custom domain.

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function staticRecipe(d) {
  const ing = (d.recipeIngredient || []).map((i) => "<li>" + esc(i) + "</li>").join("");
  const steps = (d.recipeInstructions || []).map((s) => "<li>" + esc(typeof s === "string" ? s : s.text) + "</li>").join("");
  const authors = [].concat(d.author || []).map((a) => a.name).filter(Boolean).join(" & ");
  return "<article class='static-recipe'><header><h1>" + esc(d.name) + "</h1>" +
    (authors ? "<div class='byline'>By " + esc(authors) + "</div>" : "") +
    "<p class='lede'>" + esc(d.description) + "</p></header>" +
    "<section class='card'><h2>Ingredients</h2><ul>" + ing + "</ul></section>" +
    "<section class='card'><h2>Method</h2><ol>" + steps + "</ol></section></article>";
}

export async function onRequest(context) {
  const res = await context.next();
  const type = res.headers.get("content-type") || "";
  if (!type.includes("text/html") || res.status !== 200) return res;

  const url = new URL(context.request.url);
  const origin = url.origin;
  let path = url.pathname.replace(/index\.html$/, "");
  if (!path.endsWith("/") && !/\.[a-z0-9]+$/i.test(path)) path += "/";
  const canonical = origin + path;

  let html = await res.text();

  // Recipe pages: static copy of the recipe + star rating in the Google data.
  const slugMatch = path.match(/^\/recipes\/([a-z0-9-]+)\/$/);
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (slugMatch && ld && slugMatch[1] !== "_template") {
    try {
      const data = JSON.parse(ld[1]);
      if (data["@type"] === "Recipe") {
        html = html.replace('<main class="wrap" id="recipe"></main>', '<main class="wrap" id="recipe">' + staticRecipe(data) + "</main>");
        if (context.env.RATINGS) {
          const r = await context.env.RATINGS.get("r:" + slugMatch[1], "json").catch(() => null);
          if (r && r.count > 0) {
            data.aggregateRating = { "@type": "AggregateRating", ratingValue: Math.round((r.sum / r.count) * 10) / 10, ratingCount: r.count, bestRating: 5, worstRating: 1 };
            html = html.replace(ld[0], '<script type="application/ld+json">\n' + JSON.stringify(data, null, 2) + "\n</script>");
          }
        }
      }
    } catch (e) { /* leave the page as it is */ }
  }

  html = html.split('"/images/').join('"' + origin + "/images/");
  const head = '<link rel="canonical" href="' + canonical + '">\n' +
               '<meta property="og:url" content="' + canonical + '">\n';
  html = html.replace("</head>", head + "</head>");
  html = html.replace(/"url":\s*"\/"/g, '"url": "' + origin + '/"');

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(html, { status: res.status, headers });
}
