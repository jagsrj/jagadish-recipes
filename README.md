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

The home page has three tabs: Weekday, Weekend and **Festival** (Diwali sweets and snacks; set `menu: "festival"`). It opens on **Weekday** (healthy keto, high protein and fiber) Monday to Friday and **Weekend** (Tamil Nadu village style) on Saturday and Sunday. Set `menu: "weekday"` or `menu: "weekend"` in both the recipe page and `assets/recipes.js`. Links like `/#weekday` open a tab directly. Search looks across both menus.

For weekday recipes, add `nutrition` (per serving: `kcal`, `protein`, `fiber`, `netCarbs`, `fat`) to the recipe page, and `protein`, `fiber`, `netCarbs` to the home page entry. Net carbs = total carbs minus fiber.
4. Commit and push. Cloudflare redeploys automatically.

For Google recipe results, also copy the `application/ld+json` block from `recipes/chicken-kuzhambu/index.html` and update it.

## Photos

Put dish photos in `images/`. For each recipe you need:
- `images/<slug>.jpg`, a landscape photo about 1600×1000, used as the top of the recipe page
- `images/<slug>-card.jpg`, about 800×500, used on the home page card

Then set `image` in the recipe page and `image` / `hero` in `assets/recipes.js`. Add `featured: true` to show a recipe as the large "Chef's special" banner on the home page.

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

One-time setup: Cloudflare dashboard → **Workers & Pages** → this project → **Settings** → **Bindings** → **Add** → **Workers AI**, variable name `AI` → Save, then redeploy (or push any commit). Until then the box says the assistant isn't switched on yet. Workers AI has a free daily allowance.

## Amounts in each step

Add `uses: [...]` to a step to show the scaled amounts of the ingredients it needs, under the step text. See the template for the format.
