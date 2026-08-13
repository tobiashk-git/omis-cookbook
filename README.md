# Omi's Cookbook 🍲

A mobile-first, installable recipe app built from *Omi's Cookbook, 1st Edition (Dec 2017)* by
Barbara Keuneke. 69 recipes and 99 family photos digitised from the original PDF.

## Features
- **Front page** with hero, menu tiles, and a few favourites
- **Menu** browsing by the four sections (Seafood · Salads, Soups & Veg · Meat · Cakes & Desserts)
- **Recipe pages** with story, ingredients, numbered method, and the original photos + captions
- **Search & filter by ingredient** (tap ingredient chips — combine several to narrow down)
- **Add new recipes** with your own photos (camera or library)
- **Edit / delete** any recipe
- Works **offline** and **installs to the iPhone home screen** (PWA)

Your additions and edits are saved on your device (IndexedDB) — Omi's original recipes are always kept.

## Live site
**https://tobiashk-git.github.io/omis-cookbook/** (GitHub Pages, repo `tobiashk-git/omis-cookbook`).

### Install on iPhone
Open the link in **Safari** → Share button → **Add to Home Screen**. It then opens like an app and works offline.

### Updating the live site
Edit files in this folder, then:
```bash
git add -A
git commit -m "what changed"
git push
```
GitHub Pages rebuilds in about a minute. The app is network-first, so a normal reload shows your changes.

## Run locally
From this `site/` folder:

```bash
python -m http.server 8137
```

Then open <http://localhost:8137> in a browser.

## Put it on your iPhone
1. Make sure your PC and iPhone are on the same Wi-Fi.
2. Run the server (above). Find your PC's IP (e.g. `192.168.1.20`).
3. On the iPhone, open Safari → `http://192.168.1.20:8137`.
4. Share button → **Add to Home Screen**.

> For full offline support, the app should be served over **HTTPS** (free hosts like
> Netlify, Vercel or GitHub Pages work well). Over a plain LAN address it still runs,
> but the offline cache stays off.

## Regenerating the data
`extract.py` rebuilds `data/recipes.json` and `images/` from the source PDF
(`../Omi's Cookbook Edition 1.pdf`). Requires `pymupdf` (`pip install pymupdf`):

```bash
python extract.py
```

## Files
| File | Purpose |
|------|---------|
| `index.html` | app shell + iPhone PWA meta |
| `styles.css` | all styling |
| `app.js` | router, data layer, views |
| `data/recipes.json` | seeded recipes |
| `images/` | seeded photos |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA offline + install |
| `extract.py` | PDF → data generator |
