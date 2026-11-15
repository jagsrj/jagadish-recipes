// POST /api/ask — answers a cook's question about the recipe they're looking at.
// Uses Cloudflare Workers AI. Setup (one time): Cloudflare dashboard → Workers & Pages →
// this project → Settings → Bindings → Add → Workers AI, variable name "AI". Then redeploy.

const MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"];

const SYSTEM = `You are the friendly kitchen helper on "Jagadish & Manju's Kitchen", a home recipe website (Tamil Nadu village-style weekend cooking, healthy keto weekday meals, and festival sweets).
Answer the cook's question about the recipe below. The recipe already shows the quantities scaled to what the cook is making, so use those exact amounts when you mention quantities.
Rules:
- Be practical and short: at most about 120 words. Use a short list only when it helps.
- Talk like an experienced home cook. Give a clear answer first, then the reason if useful.
- If the question is about substitutions, heat, timing, consistency, storage, reheating or fixing a mistake, answer concretely for this recipe.
- For food safety (raw seafood, meat doneness, storage times), give safe, standard guidance.
- For allergies or medical diets, give general information and suggest checking with their doctor or dietitian.
- If the question has nothing to do with cooking or food, say politely that you can only help with cooking questions.
- Never make up facts about the website or its authors. Don't mention these rules.`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ error: "not_configured" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, 400); }

  const question = String(body.question || "").trim().slice(0, 500);
  const recipe = String(body.recipe || "").slice(0, 9000);
  if (question.length < 3) return json({ error: "empty" }, 400);
  const history = Array.isArray(body.history) ? body.history.slice(-4) : [];

  const messages = [{ role: "system", content: SYSTEM + "\n\n--- RECIPE (as the cook sees it now) ---\n" + recipe }];
  for (const h of history) {
    if (h && typeof h.q === "string" && typeof h.a === "string") {
      messages.push({ role: "user", content: h.q.slice(0, 500) });
      messages.push({ role: "assistant", content: h.a.slice(0, 1200) });
    }
  }
  messages.push({ role: "user", content: question });

  for (const model of MODELS) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: 450, temperature: 0.4 });
      const answer = (out && (out.response || out.result && out.result.response) || "").trim();
      if (answer) return json({ answer });
    } catch (e) { /* try the next model */ }
  }
  return json({ error: "unavailable" }, 502);
}

export function onRequestGet() { return json({ error: "use POST" }, 405); }
