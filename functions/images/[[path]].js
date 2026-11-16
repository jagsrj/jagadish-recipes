// /images/* — sends the smaller .webp copy of a photo to browsers that accept WebP
// (made by tools/make-webp.py), and the original file to everything else.
// If there's no .webp copy yet, the original is sent, so nothing breaks.
const CACHE = "public, max-age=86400, stale-while-revalidate=604800";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const accept = request.headers.get("accept") || "";
  if (/\.jpe?g$/i.test(url.pathname) && accept.includes("image/webp")) {
    const webp = new URL(url.pathname.replace(/\.jpe?g$/i, ".webp"), url.origin);
    const res = await env.ASSETS.fetch(webp);
    if (res.ok) return withHeaders(res, "image/webp");
  }
  const res = await context.next();
  return res.ok ? withHeaders(res) : res;
}

function withHeaders(res, type) {
  const h = new Headers(res.headers);
  if (type) h.set("content-type", type);
  h.set("cache-control", CACHE);
  h.set("vary", "Accept");
  return new Response(res.body, { status: res.status, headers: h });
}
