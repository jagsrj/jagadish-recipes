// Runs on Cloudflare Pages for every request. For HTML pages it adds a canonical
// link and turns "/images/..." links into full URLs (Google and WhatsApp previews
// need full URLs). It works out the site's address from the request, so it keeps
// working on *.pages.dev and on a custom domain.
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
  html = html.split('"/images/').join('"' + origin + "/images/");
  const head = '<link rel="canonical" href="' + canonical + '">\n' +
               '<meta property="og:url" content="' + canonical + '">\n';
  html = html.replace("</head>", head + "</head>");
  html = html.replace(/"url":\s*"\/"/g, '"url": "' + origin + '/"');

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(html, { status: res.status, headers });
}
