"""Extract Omi's Cookbook recipes + photos from the PDF into structured JSON.

Outputs:
  site/data/recipes.json   - list of recipe objects
  site/images/*.jpg        - extracted photos referenced by recipes
"""
import json, re, os
import pymupdf as fitz

PDF = os.path.join(os.path.dirname(__file__), "..", "Omi's Cookbook Edition 1.pdf")
SITE = os.path.dirname(__file__)
IMG_DIR = os.path.join(SITE, "images")
DATA_DIR = os.path.join(SITE, "data")

# (printed_page, category, title). PDF index = printed_page + 1.
TOC = [
    (7,  "Seafood", "Home Smoked Mackerel"),
    (9,  "Seafood", "A Garfish Recipe"),
    (10, "Seafood", "Bass"),
    (12, "Seafood", "Creamy Pasta with Salmon (1)"),
    (13, "Seafood", "Creamy Pasta with Salmon (2)"),
    (15, "Seafood", "Seafood Chowder (1)"),
    (16, "Seafood", "Seafood Chowder (2)"),
    (18, "Seafood", "A Very Simple Fish Pie"),
    (20, "Seafood", "Forelle – Trout"),
    (22, "Seafood", "Shore Crab Bisque"),
    (25, "Seafood", "Fried Mackerel"),
    (26, "Seafood", "Salmon, Prawn & Samphire Risotto (1)"),
    (27, "Seafood", "Salmon, Prawn & Samphire Risotto (2)"),
    (28, "Seafood", "Sherry Mackerels"),
    (30, "Seafood", "Mussels Moules Mucheln"),
    (34, "Seafood", "Salmon with a Green Sauce"),

    (36, "Salads, Soups & Veg", "Bratkartoffeln"),
    (38, "Salads, Soups & Veg", "Cornish Pasties"),
    (39, "Salads, Soups & Veg", "Omi's Simple Chicken Soup"),
    (40, "Salads, Soups & Veg", "Swemmkloeschen"),
    (41, "Salads, Soups & Veg", "Potato Salad"),
    (43, "Salads, Soups & Veg", "Bacon & Stilton Risotto"),
    (44, "Salads, Soups & Veg", "Red Cabbage (1)"),
    (45, "Salads, Soups & Veg", "Red Cabbage (2)"),
    (46, "Salads, Soups & Veg", "Tomato & Rice Soup"),
    (47, "Salads, Soups & Veg", "Pizza"),
    (49, "Salads, Soups & Veg", "Leek & Potato Soup"),
    (50, "Salads, Soups & Veg", "Hot 3 Bean Salad"),
    (51, "Salads, Soups & Veg", "Puy Lentil Soup with Spinach"),
    (52, "Salads, Soups & Veg", "Spaghetti ala Carbonara"),
    (53, "Salads, Soups & Veg", "Pfannkuchen Pancakes"),

    (55, "Meat Dishes", "Arni Psito – The Greek"),
    (57, "Meat Dishes", "Lambs Liver"),
    (59, "Meat Dishes", "Lamb Steak a la Greek"),
    (60, "Meat Dishes", "Roast Chicken"),
    (63, "Meat Dishes", "Lamb Casserole with Apricots"),
    (65, "Meat Dishes", "Grune Kohl / Curly Kale"),
    (66, "Meat Dishes", "Eier, Lamb & Chicken Fricassee"),
    (68, "Meat Dishes", "Sausages & Mashed Potatoes"),
    (70, "Meat Dishes", "Irish Stew"),
    (71, "Meat Dishes", "Venison / Pheasant Casserole"),
    (73, "Meat Dishes", "Slow Roasted Shoulder of Lamb"),
    (76, "Meat Dishes", "Pollo al Chilindron"),
    (78, "Meat Dishes", "Hare or Rabbit"),
    (79, "Meat Dishes", "Birnen, Bohnen und Speck"),
    (82, "Meat Dishes", "Steckrueben"),
    (84, "Meat Dishes", "Rabbit Stifado"),
    (86, "Meat Dishes", "Beef Stew & Parsley Dumplings"),
    (88, "Meat Dishes", "Tinker's Pie"),
    (90, "Meat Dishes", "Rouladen Rolladen"),
    (94, "Meat Dishes", "Beef Stroganoff"),
    (95, "Meat Dishes", "Rundstuck Warm"),
    (97, "Meat Dishes", "Moroccan Chicken or Lamb"),

    (101, "Cakes & Desserts", "Chocolate Espresso Cake"),
    (105, "Cakes & Desserts", "Biscuits with Porridge Oats"),
    (107, "Cakes & Desserts", "Blackberry & Apple Crumble"),
    (109, "Cakes & Desserts", "Chocolate Mousse"),
    (111, "Cakes & Desserts", "Chocolate Muffins"),
    (113, "Cakes & Desserts", "Lemon Yoghurt Cake"),
    (114, "Cakes & Desserts", "A Swirly Chocolate Shortbread"),
    (117, "Cakes & Desserts", "Stem Ginger Shortbread"),
    (118, "Cakes & Desserts", "Everybody's Favourite Apple Cake"),
    (121, "Cakes & Desserts", "Lemon Biscuits"),
    (122, "Cakes & Desserts", "Marble Cake, Marmorkuchen"),
    (124, "Cakes & Desserts", "Chocolate Orange Drizzle Cake"),
    (125, "Cakes & Desserts", "Frozen Lemon Dessert"),
    (127, "Cakes & Desserts", "Stuffed Peaches"),
    (129, "Cakes & Desserts", "Lemon Polenta Cake"),
    (131, "Cakes & Desserts", "Stollen: German Christmas Cake"),
]

# Ingredient vocabulary used to tag recipes for filtering.
VOCAB = [
    "salmon","mackerel","cod","trout","bass","garfish","crab","prawn","mussels","samphire",
    "anchovy","dogfish","pollack","fish","bacon","lamb","beef","pork","chicken","sausage",
    "rabbit","hare","venison","pheasant","liver","ham","egg","stilton","cheddar","parmesan",
    "feta","cheese","cream","milk","butter","yoghurt","potato","onion","garlic","tomato",
    "carrot","celery","leek","cabbage","kale","spinach","bean","lentil","pea","mushroom",
    "cucumber","apple","apricot","peach","lemon","orange","blackberry","cherry","pear","ginger",
    "chocolate","coffee","espresso","rice","pasta","spaghetti","noodle","flour","oats","polenta",
    "bread","baguette","wine","sherry","marsala","cognac","lager","curry","mustard","capers",
    "gherkin","chickpea","tahini","cinnamon","nutmeg","thyme","parsley","fennel","tarragon",
    "bay","juniper","caraway","chilli","pepper","sugar","honey",
]

STEP_RE = re.compile(r"^\s*\d+\s*[\)\.]")
# An ingredient line starts with a quantity marker.
QTY_RE = re.compile(
    r"^\s*(\d|½|¼|¾|a\s|an\s|one\b|two\b|three\b|four\b|some\b|a few\b|a hand|"
    r"a small|a large|a medium|a little|a pinch|a clove|a cup|a knob|a tin|a bunch|"
    r"salt\b|pepper\b|olive oil\b|butter\b|freshly)",
    re.I,
)


def clean(line):
    # Fix encoding artifacts from the PDF's non-standard glyphs.
    line = (line.replace("�", "'").replace("’", "'").replace("‘", "'")
                .replace("“", '"').replace("”", '"').replace("–", "-")
                .replace("…", "..."))
    return re.sub(r"\s+", " ", line).strip()


def classify(lines):
    """Split a recipe's body lines into story / ingredients / method.

    Story is the leading descriptive block. After that, each line is judged on
    its own: numbered steps and long prose are method; short quantity/unit lines
    (and short fragments like "salt") are ingredients. Ingredient lines are
    collected wherever they appear, since Omi lists them in prose style.
    """
    story, ingredients, method = [], [], []
    started = False  # left the opening story block?
    for ln in lines:
        words = ln.split()
        is_step = bool(STEP_RE.match(ln))
        is_qty = bool(QTY_RE.match(ln)) and not is_step and len(words) <= 12

        if not started:
            if is_step or is_qty:
                started = True
            else:
                story.append(ln)
                continue

        if is_qty:
            ingredients.append(ln)
        else:
            method.append(ln)
    return story, ingredients, method


NUM_PREFIX = re.compile(r"^\s*\d{1,2}\s*\)\s*|^\s*\d{1,2}\.\s+")


def merge_steps(lines):
    """Turn wrapped method lines into whole steps.

    If the recipe uses numbered markers (1) 2) ...), each marker starts a step
    and following non-numbered lines are joined onto it. Otherwise each line is
    kept as its own step. Numbering is stripped since the UI renders its own.
    """
    numbered = sum(1 for l in lines if NUM_PREFIX.match(l))
    steps = []
    if numbered >= 2:
        cur = None
        for l in lines:
            if NUM_PREFIX.match(l):
                if cur:
                    steps.append(cur.strip())
                cur = NUM_PREFIX.sub("", l)
            else:
                if cur is None:
                    cur = l  # preamble before first marker
                else:
                    cur += " " + l
        if cur:
            steps.append(cur.strip())
    else:
        steps = [NUM_PREFIX.sub("", l).strip() for l in lines if l.strip()]
    return [s for s in steps if s]


def main():
    doc = fitz.open(PDF)
    npages = doc.page_count

    # page index (0-based) -> printed page = idx (since printed = pdf_idx-1, pdf_idx 0-based = printed+1-1=printed)
    starts = [(p + 1, cat, title) for (p, cat, title) in TOC]  # pdf 1-based index
    # build ordered list with end boundaries
    recipes = []
    for i, (pdf_idx, cat, title) in enumerate(starts):
        start0 = pdf_idx - 1  # 0-based
        end0 = (starts[i + 1][0] - 1) if i + 1 < len(starts) else npages
        recipes.append({"title": title, "category": cat, "start": start0, "end": end0})

    slug_seen = {}
    for idx, rec in enumerate(recipes):
        title_words = set(re.sub(r"[^a-z ]", "", rec["title"].lower()).split())

        def strip_title_echoes(lines):
            out = []
            for ln in lines:
                lw = set(re.sub(r"[^a-z ]", "", ln.lower()).split())
                if lw and lw.issubset(title_words) and len(ln.split()) <= 6:
                    continue
                out.append(ln)
            return out

        # slug
        base = re.sub(r"[^a-z0-9]+", "-", rec["title"].lower()).strip("-")
        n = slug_seen.get(base, 0)
        slug_seen[base] = n + 1
        slug = base if n == 0 else f"{base}-{n}"

        body = []          # recipe text lines (non-caption pages)
        photos = []        # {src, caption}
        img_counter = 0
        for p in range(rec["start"], rec["end"]):
            page = doc[p]
            page_lines = strip_title_echoes(
                [clean(t) for t in page.get_text().splitlines() if clean(t)]
            )
            page_imgs = []
            for img in page.get_images(full=True):
                xref = img[0]
                try:
                    pix = fitz.Pixmap(doc, xref)
                except Exception:
                    continue
                if pix.width < 150 or pix.height < 120:
                    continue
                if pix.n >= 5:
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                page_imgs.append(pix)

            page_wordcount = sum(len(l.split()) for l in page_lines)
            # A "caption page" is mostly a photo with a short caption.
            is_caption_page = page_imgs and page_wordcount <= 10
            caption = " ".join(page_lines).strip(" .") if is_caption_page else ""

            if not is_caption_page:
                body.extend(page_lines)

            for pix in page_imgs:
                fname = f"{slug}-{img_counter}.jpg"
                fpath = os.path.join(IMG_DIR, fname)
                try:
                    pix.save(fpath, jpg_quality=82)
                except Exception:
                    try:
                        pix.pil_save(fpath, format="JPEG", quality=82)
                    except Exception:
                        continue
                photos.append({"src": f"images/{fname}", "caption": caption})
                img_counter += 1

        story, ingredients, method = classify(body)
        method = merge_steps(method)

        text_l = " ".join(body).lower()
        tags = sorted({v for v in VOCAB if re.search(r"\b" + re.escape(v) + r"(s|es)?\b", text_l)})

        recipes[idx] = {
            "id": slug,
            "title": rec["title"],
            "category": rec["category"],
            "story": " ".join(story).strip(),
            "ingredients": ingredients,
            "method": method,
            "tags": tags,
            "photos": photos,
            "source": "Omi's Cookbook, 1st Edition (Dec 2017) — Barbara Keuneke",
        }

    with open(os.path.join(DATA_DIR, "recipes.json"), "w", encoding="utf-8") as f:
        json.dump(recipes, f, ensure_ascii=False, indent=1)

    imgs = sum(len(r["photos"]) for r in recipes)
    print(f"wrote {len(recipes)} recipes, {imgs} images")
    # quick sanity print
    for r in recipes[:3]:
        print("-", r["title"], "| ing:", len(r["ingredients"]), "| steps:", len(r["method"]),
              "| imgs:", len(r["images"]), "| tags:", r["tags"][:6])


if __name__ == "__main__":
    main()
