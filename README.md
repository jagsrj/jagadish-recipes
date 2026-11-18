# Jagadish & Manju's Kitchen

A static recipe site where every recipe scales to the amount you're cooking. It has no build step and no server, so it can go straight onto Cloudflare Pages.

```
index.html                    home page (cards and search)
assets/style.css              shared look
assets/recipe-engine.js       scaling, timers, rendering (shared)
assets/recipes.js             list of recipes shown on the home page
recipes/chicken-kuzhambu/     one folder per recipe
recipes/_template/            copy this to start a new recipe
```

## Add a new recipe

1. Copy `recipes/_template/` to `recipes/<slug>/`, for example `recipes/mutton-kuzhambu/`.
2. Edit `window.RECIPE` in the new `index.html`. Set `slug` to the folder name and `author` to whoever is posting it, and fill in the ingredients and steps. The comments in the template explain each field.
3. Add an entry to `assets/recipes.js`, including `author` and `menu`, so it appears on the home page.

## Weekday and weekend menus

The home page has four tabs: Weekday, Weekend, **Festival** (Diwali sweets and snacks; set `menu: "festival"`) and **Kids** (mild kid favourites like pasta; set `menu: "kids"`). It opens on **Weekday** (healthy keto, high protein and fiber) Monday to Friday and **Weekend** (Tamil Nadu village style) on Saturday and Sunday. Set `menu: "weekday"` or `menu: "weekend"` in both the recipe page and `assets/recipes.js`. Links like `/#weekday` open a tab directly. Search looks across both menus.

Every recipe has `nutrition` on its page (per serving: `kcal`, `protein`, `carbs`, `fiber`, `addedSugar`, `netCarbs`, `fat`, `goodFatPct`, `badFat`) and `protein`, `carbs`, `fiber`, `netCarbs`, `goodFatPct` in its home page entry. For sweets and snacks add `per: "laddu"` (or `"cup"`, etc.) so it reads per piece. `addedSugar` counts only sugar, jaggery and syrup you add (not the natural sugar in onions or tomatoes); add it to the home page entry too when it's 2 g or more, so it shows on the card. Net carbs = total carbs minus fiber. Good fat = unsaturated; bad fat (`badFat`, in grams) = saturated plus trans, and `goodFatPct` is the unsaturated share of total fat. The page shows these as a green/red bar. Also put the same numbers in the `nutrition` block of the `application/ld+json` (`carbohydrateContent`, `saturatedFatContent`, `unsaturatedFatContent`).
4. Commit and push. Cloudflare redeploys automatically.

For Google recipe results, also copy the `application/ld+json` block from `recipes/chicken-kuzhambu/index.html` and update it, including `image` and `datePublished`. Google needs an image to show a recipe result; use the share card (`/images/og/<slug>.png`) until you have a photo. The site also writes the ingredients and method from this block into the page as plain HTML, so search engines see the recipe without running JavaScript.

## Photos

Put dish photos in `images/`. For each recipe you need:
- `images/<slug>.jpg`, a landscape photo about 1600×1000, used as the top of the recipe page
- `images/<slug>-card.jpg`, about 800×500, used on the home page card

Then run `python3 tools/make-webp.py` to make smaller WebP copies (browsers that support WebP get those automatically; keep the `.jpg` too), and set `image` in the recipe page and `image` / `hero` in `assets/recipes.js`. Also change the recipe's `application/ld+json` `image` from the `/images/og/...png` card to the photo, so Google shows the real dish. Add `featured: true` to show a recipe as the large "Chef's special" banner on the home page.

**Shooting tips:** take photos in daylight near a window with no flash, shoot from directly above or at 45°, use a dark wooden board or a banana leaf underneath, and add a garnish and a side dish to the frame.

## Preview locally

```
npx serve .
```

Then open http://localhost:3000. Paths start with `/`, so open the pages through a server rather than double-clicking the file.

## Deploy on Cloudflare Pages

1. Push this folder to a GitHub repo, for example `jagsrj/jagadish-recipes`.
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
3. Build settings: framework preset **None**, build command left empty, output directory `/`.
4. Deploy. The site goes live at `<project>.pages.dev`. You can add your own domain under **Custom domains**.

## Search engines and sharing

- `functions/` runs on Cloudflare Pages. It serves `/sitemap.xml` and `/robots.txt`, both built automatically from `assets/recipes.js`, and adds canonical links and full image URLs to every page. It uses whatever domain the site is on, so nothing needs changing if you add a custom domain.
- New recipe? Copy the icon/manifest/`og:` tags from the template's `<head>`, then run `python3 tools/make-share-cards.py` to draw its link-preview card (used when shared on WhatsApp etc.) if it has no photo yet.
- Register the site in [Google Search Console](https://search.google.com/search-console) and submit `https://<your-domain>/sitemap.xml` so Google finds new recipes quickly.
- Preview with functions locally: `npx wrangler pages dev .`

## Recipe assistant ("Ask about this recipe")

Each recipe page has a question box backed by `functions/api/ask.js`, which sends the question plus the recipe (with the visitor's current quantities) to Cloudflare Workers AI.

Guardrails (see the top of `functions/api/ask.js`): same-site requests only, rate limits (6 a minute and 40 a day per visitor, 500 a day site-wide), input length limits, recipe must be one of ours, Llama Guard safety screen on questions, a cooking-only system prompt that treats the recipe text as data, and links/markup stripped from answers.

Optional: add a **KV namespace** binding named `RATE` (Settings → Bindings → KV namespace) so rate limits hold across all of Cloudflare's servers.

One-time setup: Cloudflare dashboard → **Workers & Pages** → this project → **Settings** → **Bindings** → **Add** → **Workers AI**, variable name `AI` → Save, then redeploy (or push any commit). Until then the box says the assistant isn't switched on yet. Workers AI has a free daily allowance.

## Ratings

Recipe pages have a "Made it?" star rating, the average shows under the photo and on the home page cards, and Google gets it for the star line in search results. One rating per visitor per recipe (rating again replaces it).

One-time setup: Cloudflare dashboard → **Workers & Pages** → this project → **Settings** → **Bindings** → **Add** → **KV namespace**, variable name `RATINGS`, create a new namespace (e.g. `jmk-ratings`) → Save, then redeploy. Until then the stars say ratings aren't switched on yet.

## Cook mode, shopping list and weekly planner

- **Cook mode** (button at the top of every recipe) shows one step at a time in big text with its timer and scaled amounts, and keeps the screen on. Swipe or use the arrow keys to move between steps.
- **Tap a step's number** in the method to mark it done.
- **Add to shopping list** saves the recipe's ingredients, at the amount you're cooking, to the list at `/plan/#list`.
- **`/plan/`** lets you pick a recipe for each day of the week and turn the week into one shopping list. The same ingredient in different recipes is added together. Plans and lists are saved on the phone.

## Home page filters and Tamil names

Quick filters (under 1 hour, 30 g+ protein, chicken, seafood, veg & egg) work from `time`, `nutrition` and `tags` in `assets/recipes.js`. Add `tamil: "..."` to an entry to show the Tamil name on its card; search finds Tamil names too.

## Offline

`sw.js` saves the site on the phone, including every recipe page, so recipes open with weak or no Wi-Fi. If you change the list of core files in `sw.js`, bump `VERSION` at the top.

## Amounts in each step

Add `uses: [...]` to a step to show the scaled amounts of the ingredients it needs, under the step text. See the template for the format.
