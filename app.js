/* Omi's Cookbook — vanilla JS PWA
   Data model:
   - Seed recipes ship in data/recipes.json with photos in images/.
   - User changes (new recipes, edits, deletes) live in IndexedDB so they persist
     and survive offline. Uploaded photos are stored as blobs.
*/
(() => {
'use strict';

// ---------- Categories ----------
const CATEGORIES = [
  { id: 'seafood',  name: 'Seafood',              match: 'Seafood',              emoji: '🐟' },
  { id: 'veg',      name: 'Salads, Soups & Veg',  match: 'Salads, Soups & Veg',  emoji: '🥗' },
  { id: 'meat',     name: 'Meat Dishes',          match: 'Meat Dishes',          emoji: '🍖' },
  { id: 'cakes',    name: 'Cakes & Desserts',     match: 'Cakes & Desserts',     emoji: '🍰' },
];
const catById = id => CATEGORIES.find(c => c.id === id);
const catByName = name => CATEGORIES.find(c => c.match === name);

// ---------- IndexedDB tiny wrapper ----------
const DB = (() => {
  let dbp;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('omis-cookbook', 1);
      r.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('recipes')) db.createObjectStore('recipes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('deleted')) db.createObjectStore('deleted', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('photos'))  db.createObjectStore('photos',  { keyPath: 'id' });
      };
      r.onsuccess = e => res(e.target.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then(v => { out = v; });
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }));
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return {
    getAll:  store => tx(store, 'readonly',  s => req(s.getAll())),
    get:     (store, id) => tx(store, 'readonly', s => req(s.get(id))),
    put:     (store, val) => tx(store, 'readwrite', s => { s.put(val); }),
    del:     (store, id)  => tx(store, 'readwrite', s => { s.delete(id); }),
  };
})();

// ---------- State ----------
const state = {
  seed: [],        // from JSON
  overrides: {},   // id -> recipe (user created/edited)
  deleted: {},     // id -> true
  photoURLs: {},   // photoId -> objectURL cache
  recipes: [],     // merged, sorted
};

async function loadData() {
  const [seed, overrides, deleted] = await Promise.all([
    fetch('data/recipes.json').then(r => r.json()).catch(() => []),
    DB.getAll('recipes').catch(() => []),
    DB.getAll('deleted').catch(() => []),
  ]);
  state.seed = seed;
  state.overrides = {};
  overrides.forEach(r => { state.overrides[r.id] = r; });
  state.deleted = {};
  deleted.forEach(d => { state.deleted[d.id] = true; });
  rebuild();
}

function rebuild() {
  const map = {};
  state.seed.forEach(r => { map[r.id] = r; });
  Object.values(state.overrides).forEach(r => { map[r.id] = r; });
  state.recipes = Object.values(map)
    .filter(r => !state.deleted[r.id])
    .sort((a, b) => a.title.localeCompare(b.title));
}

function getRecipe(id) { return state.recipes.find(r => r.id === id); }

// ---------- Photo helpers ----------
async function photoURL(src) {
  if (!src) return null;
  if (src.startsWith('idb:')) {
    const id = src.slice(4);
    if (state.photoURLs[id]) return state.photoURLs[id];
    const rec = await DB.get('photos', id);
    if (!rec) return null;
    const url = URL.createObjectURL(rec.blob);
    state.photoURLs[id] = url;
    return url;
  }
  return src; // relative path to shipped image
}

// resolve a recipe's photo objects into {url, caption}
async function resolvePhotos(recipe) {
  const list = recipe.photos || [];
  const out = [];
  for (const p of list) {
    const url = await photoURL(p.src);
    if (url) out.push({ url, caption: p.caption || '' });
  }
  return out;
}
async function coverURL(recipe) {
  const list = recipe.photos || [];
  for (const p of list) { const u = await photoURL(p.src); if (u) return u; }
  return null;
}

// ---------- Utilities ----------
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  kids.flat().forEach(k => n.append(k?.nodeType ? k : document.createTextNode(k ?? '')));
  return n;
};
const esc = s => (s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
function snippet(r) {
  return r.story || (r.method && r.method[0]) || (r.ingredients || []).slice(0,3).join(', ');
}
function allTags() {
  const set = new Set();
  state.recipes.forEach(r => (r.tags || []).forEach(t => set.add(t)));
  return [...set].sort();
}
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = el('div', { class: 'toast' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1900);
}

// lazy-load an <img> once its real URL resolves
function lazyImg(promise, { cls = '', alt = '', fallbackEmoji = '🍲' } = {}) {
  const box = el('div', { class: 'imgwrap' });
  promise.then(url => {
    if (url) box.append(el('img', { src: url, alt, class: cls, loading: 'lazy' }));
    else box.append(el('div', { class: 'ph' }, fallbackEmoji));
  });
  return box;
}

// ---------- Router ----------
const app = document.getElementById('app');
function go(hash) { location.hash = hash; }
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  return h.split('/').map(decodeURIComponent);
}
window.addEventListener('hashchange', render);

async function render() {
  const [route, arg] = parseHash();
  window.scrollTo(0, 0);
  switch (route) {
    case '': case 'home':        return viewHome();
    case 'category':             return viewCategory(arg);
    case 'search':               return viewSearch();
    case 'recipe':               return viewRecipe(arg);
    case 'new':                  return viewForm(null);
    case 'edit':                 return viewForm(arg);
    default:                     return viewHome();
  }
}

// ---------- Chrome (top bar + tab bar) ----------
function topbar(title, { back = false } = {}) {
  const bar = el('div', { class: 'topbar' + (back ? ' has-back' : '') });
  bar.append(
    el('button', { class: 'back', onclick: () => history.length > 1 ? history.back() : go('/'), 'aria-label': 'Back' }, '‹'),
    back ? '' : el('span', { class: 'brandmark' }, '🍲'),
    el('h1', {}, title),
  );
  return bar;
}
function tabbar(active) {
  const item = (href, icon, label, cls = '') =>
    el('a', { href, class: (cls + (active === label.toLowerCase() ? ' active' : '')).trim() },
       el('span', { class: 'ti' }, icon), label);
  return el('nav', { class: 'tabbar' },
    item('#/', '🏠', 'Home'),
    item('#/category/seafood', '📖', 'Menu'),
    item('#/new', '＋', 'Add', 'add'),
    item('#/search', '🔎', 'Search'),
  );
}
function mount(nodes, activeTab) {
  app.innerHTML = '';
  [].concat(nodes).forEach(n => n && app.append(n));
  document.querySelectorAll('.tabbar').forEach(t => t.remove());
  document.body.append(tabbar(activeTab));
}

// ---------- Home ----------
async function viewHome() {
  const wrap = el('div');
  const hero = el('div', { class: 'hero' },
    el('div', { class: 'kicker' }, "Barbara Keuneke"),
    el('h2', {}, "Omi's Cookbook"),
    el('p', {}, 'Lots of lovely recipes — fish fresh off the boat, hearty German suppers and the cakes we all grew up with.'),
  );
  const search = el('div', { class: 'search', onclick: () => go('/search') },
    el('span', { class: 'ic' }, '🔎'),
    el('input', { placeholder: 'Search recipes or ingredients…', readonly: 'readonly' }),
  );

  const cats = el('div', { class: 'cats' });
  for (const c of CATEGORIES) {
    const list = state.recipes.filter(r => r.category === c.match);
    const tile = el('a', { href: `#/category/${c.id}`, class: 'cat' },
      lazyImgInto(pickCover(list)),
      el('span', { class: 'emoji' }, c.emoji),
      el('span', { class: 'lbl' }, c.name, el('small', {}, `${list.length} recipes`)),
    );
    cats.append(tile);
  }

  // featured: a few with photos
  const featured = state.recipes.filter(r => (r.photos || []).length).slice(0, 4);

  const secCats = el('div', { class: 'sec-h' }, 'Menu', el('span', { class: 'count' }, `${state.recipes.length} recipes`));
  const body = el('div', { class: 'wrap' }, secCats, cats);

  if (featured.length) {
    body.append(el('div', { class: 'sec-h' }, 'A few favourites'));
    const list = el('div', { class: 'list' });
    for (const r of featured) list.append(await recipeCard(r));
    body.append(list);
  }
  body.append(el('p', { class: 'source-note' }, "Digitised from Omi's Cookbook, 1st Edition · December 2017"));

  wrap.append(topbar("Omi's Cookbook"), hero, search, body);
  mount(wrap, 'home');
}

// helper: choose a cover image src (string promise) for a category tile
function pickCover(list) {
  const withPhoto = list.find(r => (r.photos || []).length);
  return withPhoto ? coverURL(withPhoto) : Promise.resolve(null);
}
function lazyImgInto(promise) {
  const img = el('img', { alt: '' });
  promise.then(url => { if (url) img.src = url; });
  return img;
}

// ---------- Recipe card ----------
async function recipeCard(r) {
  const thumb = el('div', { class: 'thumb' });
  const url = await coverURL(r);
  if (url) thumb.append(el('img', { src: url, alt: r.title, loading: 'lazy' }));
  else thumb.append(el('div', { class: 'ph' }, catByName(r.category)?.emoji || '🍲'));

  const tags = el('div', { class: 'tags' });
  (r.tags || []).slice(0, 3).forEach(t => tags.append(el('span', { class: 'tag' }, t)));

  return el('a', { href: `#/recipe/${r.id}`, class: 'rcard' },
    thumb,
    el('div', { class: 'body' },
      el('span', { class: 'cat-pill' }, r.category),
      el('h3', {}, r.title),
      el('div', { class: 'snip' }, snippet(r)),
      tags,
    ),
  );
}

// ---------- Category ----------
async function viewCategory(catId) {
  const c = catById(catId) || CATEGORIES[0];
  const list = state.recipes.filter(r => r.category === c.match);

  const wrap = el('div');
  const body = el('div', { class: 'wrap' });

  // switch chips between categories
  const chips = el('div', { class: 'chips' });
  CATEGORIES.forEach(cc => chips.append(
    el('a', { href: `#/category/${cc.id}`, class: 'chip' + (cc.id === c.id ? ' active' : '') }, `${cc.emoji} ${cc.name}`)
  ));
  body.append(chips);
  body.append(el('div', { class: 'sec-h' }, c.name, el('span', { class: 'count' }, `${list.length} recipes`)));

  const listEl = el('div', { class: 'list' });
  for (const r of list) listEl.append(await recipeCard(r));
  body.append(listEl);

  wrap.append(topbar(c.name, { back: true }), body);
  mount(wrap, 'menu');
}

// ---------- Search + ingredient filter ----------
const searchState = { q: '', tags: new Set() };
async function viewSearch() {
  const wrap = el('div');
  const body = el('div', { class: 'wrap' });

  const input = el('input', { placeholder: 'Search title, story or ingredient…', value: searchState.q, autofocus: 'autofocus' });
  input.addEventListener('input', () => { searchState.q = input.value; renderResults(); });
  body.append(el('div', { class: 'search' }, el('span', { class: 'ic' }, '🔎'), input));

  body.append(el('div', { class: 'sec-h' }, 'Filter by ingredient'));
  const chips = el('div', { class: 'chips', style: 'flex-wrap:wrap;overflow:visible' });
  allTags().forEach(t => {
    const chip = el('button', { class: 'chip' + (searchState.tags.has(t) ? ' active' : '') }, t);
    chip.addEventListener('click', () => {
      searchState.tags.has(t) ? searchState.tags.delete(t) : searchState.tags.add(t);
      chip.classList.toggle('active');
      renderResults();
    });
    chips.append(chip);
  });
  body.append(chips);

  const results = el('div', { class: 'list', id: 'results' });
  const resultsHead = el('div', { class: 'sec-h', id: 'results-head' }, 'Recipes');
  body.append(resultsHead, results);

  wrap.append(topbar('Search', { back: true }), body);
  mount(wrap, 'search');
  renderResults();

  async function renderResults() {
    const q = searchState.q.trim().toLowerCase();
    const tags = searchState.tags;
    const matches = state.recipes.filter(r => {
      if (tags.size) {
        const rt = new Set(r.tags || []);
        for (const t of tags) if (!rt.has(t)) return false; // AND
      }
      if (!q) return true;
      const hay = [r.title, r.story, (r.ingredients || []).join(' '), (r.tags || []).join(' '), r.category]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });
    const head = document.getElementById('results-head');
    const box = document.getElementById('results');
    if (!box) return;
    head.textContent = '';
    head.append('Recipes', el('span', { class: 'count' }, `${matches.length} found`));
    box.innerHTML = '';
    if (!matches.length) {
      box.append(el('div', { class: 'empty' }, el('div', { class: 'big' }, '🍽️'), 'No recipes match. Try fewer filters.'));
      return;
    }
    for (const r of matches) box.append(await recipeCard(r));
  }
}

// ---------- Recipe detail ----------
async function viewRecipe(id) {
  const r = getRecipe(id);
  if (!r) { mount(el('div', {}, topbar('Not found', { back: true }), el('div', { class: 'empty' }, 'Recipe not found.')), ''); return; }

  const photos = await resolvePhotos(r);
  const wrap = el('div', { class: 'detail' });
  wrap.append(topbar(r.title, { back: true }));

  if (photos[0]) {
    wrap.append(el('img', { class: 'cover', src: photos[0].url, alt: r.title }));
    if (photos[0].caption) wrap.append(el('p', { class: 'cover-cap' }, photos[0].caption));
  }

  const body = el('div', { class: 'detail-body' });
  body.append(
    el('div', { class: 'meta' }, el('span', { class: 'cat-pill' }, r.category)),
    el('h2', {}, r.title),
  );
  if (r.story) body.append(el('p', { class: 'story' }, '“' + r.story + '”'));

  if ((r.ingredients || []).length) {
    const ul = el('ul', { class: 'ing-list' });
    r.ingredients.forEach(i => ul.append(el('li', {}, i)));
    body.append(el('div', { class: 'card-block' }, el('h4', {}, '🧺 Ingredients'), ul));
  }
  if ((r.method || []).length) {
    const ol = el('ul', { class: 'steps' });
    // merge continuation fragments: keep as separate steps but skip empties
    r.method.forEach(m => ol.append(el('li', {}, m)));
    body.append(el('div', { class: 'card-block' }, el('h4', {}, '👩‍🍳 Method'), ol));
  }

  if ((r.tags || []).length) {
    const tg = el('div', { class: 'tags', style: 'margin:10px 0' });
    r.tags.forEach(t => tg.append(el('a', { href: `#/search`, class: 'tag', onclick: () => { searchState.tags = new Set([t]); searchState.q=''; } }, t)));
    body.append(el('div', { class: 'sec-h', style:'font-size:16px' }, 'Ingredients at a glance'), tg);
  }

  // extra photos
  if (photos.length > 1) {
    const g = el('div', { class: 'gallery' });
    photos.slice(1).forEach(p => {
      const fig = el('figure', {}, el('img', { src: p.url, alt: r.title, loading: 'lazy' }));
      if (p.caption) fig.append(el('figcaption', {}, p.caption));
      g.append(fig);
    });
    body.append(el('div', { class: 'sec-h', style:'font-size:16px' }, 'Photos'), g);
  }

  // actions
  body.append(el('div', { class: 'btn-row' },
    el('a', { class: 'btn ghost block', href: `#/edit/${r.id}` }, '✎ Edit recipe'),
  ));
  if (r.source) body.append(el('p', { class: 'source-note' }, r.source));

  wrap.append(body);
  mount(wrap, '');
}

// ---------- Add / Edit form ----------
async function viewForm(id) {
  const editing = !!id;
  const existing = editing ? getRecipe(id) : null;
  const draft = {
    id: existing?.id || null,
    title: existing?.title || '',
    category: existing?.category || CATEGORIES[0].match,
    story: existing?.story || '',
    ingredients: (existing?.ingredients || []).join('\n'),
    method: (existing?.method || []).join('\n'),
    photos: (existing?.photos || []).slice(),   // {src,caption}
  };
  const newPhotos = []; // {blob, url}

  const wrap = el('div');
  wrap.append(topbar(editing ? 'Edit recipe' : 'New recipe', { back: true }));
  const body = el('div', { class: 'wrap' });

  const titleI = mkField('Title', el('input', { value: draft.title, placeholder: 'e.g. Omi’s Apple Cake' }));
  const catSel = el('select', {});
  CATEGORIES.forEach(c => catSel.append(el('option', { value: c.match, ...(c.match === draft.category ? { selected: 'selected' } : {}) }, `${c.emoji} ${c.name}`)));
  const catF = mkField('Menu section', catSel);
  const storyI = mkField('Story / intro', el('textarea', { placeholder: 'A little note about the dish…', style: 'min-height:80px' }, draft.story));
  const ingI = mkField('Ingredients', el('textarea', { placeholder: 'One per line' }, draft.ingredients), 'One ingredient per line.');
  const methI = mkField('Method', el('textarea', { placeholder: 'One step per line' }, draft.method), 'One step per line.');

  // photos
  const previews = el('div', { class: 'photo-previews' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: 'multiple' });
  const drop = el('label', { class: 'photo-drop' }, '📷  Tap to add photos', fileInput);
  fileInput.addEventListener('change', async () => {
    for (const file of fileInput.files) {
      const blob = await downscale(file);
      const url = URL.createObjectURL(blob);
      newPhotos.push({ blob, url });
    }
    fileInput.value = '';
    drawPreviews();
  });
  function drawPreviews() {
    previews.innerHTML = '';
    draft.photos.forEach((p, i) => addPrev(p.src.startsWith('idb:') ? null : p.src, () => { draft.photos.splice(i, 1); drawPreviews(); }, p.src));
    newPhotos.forEach((p, i) => addPrev(p.url, () => { newPhotos.splice(i, 1); drawPreviews(); }));
  }
  function addPrev(url, onRemove, idbSrc) {
    const pp = el('div', { class: 'pp' });
    const img = el('img', { alt: '' });
    if (url) img.src = url; else photoURL(idbSrc).then(u => u && (img.src = u));
    pp.append(img, el('button', { onclick: onRemove, 'aria-label': 'Remove' }, '×'));
    previews.append(pp);
  }
  drawPreviews();
  const photoF = mkField('Photos', el('div', {}, drop, previews));

  const save = el('button', { class: 'btn block' }, editing ? 'Save changes' : 'Add recipe');
  save.addEventListener('click', async () => {
    const title = titleI.querySelector('input').value.trim();
    if (!title) { toast('Please add a title'); return; }
    save.disabled = true;

    // store new photos as blobs
    const photoObjs = draft.photos.slice();
    for (const np of newPhotos) {
      const pid = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      await DB.put('photos', { id: pid, blob: np.blob });
      photoObjs.push({ src: 'idb:' + pid, caption: '' });
    }

    const rid = draft.id || slugify(title) + '-' + Math.random().toString(36).slice(2, 6);
    const recipe = {
      id: rid,
      title,
      category: catSel.value,
      story: storyI.querySelector('textarea').value.trim(),
      ingredients: linesOf(ingI.querySelector('textarea').value),
      method: linesOf(methI.querySelector('textarea').value),
      tags: deriveTags(ingI.querySelector('textarea').value + ' ' + methI.querySelector('textarea').value + ' ' + title),
      photos: photoObjs,
      source: existing?.source || 'Added to Omi’s Cookbook',
    };
    await DB.put('recipes', recipe);
    state.overrides[rid] = recipe;
    rebuild();
    toast(editing ? 'Saved' : 'Recipe added');
    go('/recipe/' + rid);
  });

  const actions = el('div', { class: 'btn-row' }, save);
  const delRow = editing ? el('div', { class: 'btn-row' },
    el('button', { class: 'btn ghost block', onclick: () => confirmDelete(id) }, '🗑  Delete recipe')) : '';

  body.append(titleI, catF, storyI, ingI, methI, photoF, actions, delRow);
  wrap.append(body);
  mount(wrap, editing ? '' : 'add');
}

function mkField(label, control, hint) {
  const f = el('div', { class: 'field' }, el('label', {}, label), control);
  if (hint) f.append(el('div', { class: 'hint' }, hint));
  return f;
}
function linesOf(text) { return text.split('\n').map(s => s.trim()).filter(Boolean); }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'recipe'; }

const VOCAB = ['salmon','mackerel','cod','trout','bass','garfish','crab','prawn','mussels','samphire','anchovy','dogfish','pollack','fish','bacon','lamb','beef','pork','chicken','sausage','rabbit','hare','venison','pheasant','liver','ham','egg','stilton','cheddar','parmesan','feta','cheese','cream','milk','butter','yoghurt','potato','onion','garlic','tomato','carrot','celery','leek','cabbage','kale','spinach','bean','lentil','pea','mushroom','cucumber','apple','apricot','peach','lemon','orange','blackberry','cherry','pear','ginger','chocolate','coffee','espresso','rice','pasta','spaghetti','noodle','flour','oats','polenta','bread','baguette','wine','sherry','marsala','cognac','lager','curry','mustard','capers','gherkin','chickpea','tahini','cinnamon','nutmeg','thyme','parsley','fennel','tarragon','bay','juniper','caraway','chilli','pepper','sugar','honey'];
function deriveTags(text) {
  const t = text.toLowerCase();
  return VOCAB.filter(v => new RegExp('\\b' + v).test(t)).sort();
}

async function confirmDelete(id) {
  if (!confirm('Delete this recipe? This only affects your device.')) return;
  await DB.put('deleted', { id });
  await DB.del('recipes', id);
  delete state.overrides[id];
  state.deleted[id] = true;
  rebuild();
  toast('Recipe deleted');
  go('/');
}

// downscale an uploaded image to keep storage light
function downscale(file, max = 1400, quality = 0.82) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > max || height > max) {
        const s = max / Math.max(width, height);
        width = Math.round(width * s); height = Math.round(height * s);
      }
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      c.toBlob(b => resolve(b || file), 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

// ---------- Boot ----------
loadData().then(render).catch(err => {
  app.innerHTML = '<div class="empty">Could not load recipes.<br><small>' + esc(err.message) + '</small></div>';
});

// register service worker (offline / installable)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
})();
