// /robots.txt — lets every search engine crawl the site and points them to the sitemap.
export async function onRequest(context) {
  const origin = new URL(context.request.url).origin;
  const body = "User-agent: *\nAllow: /\nDisallow: /recipes/_template/\n\nSitemap: " + origin + "/sitemap.xml\n";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
