// ==========================================================================
// Admin für ericwinderlich.de
// Liest und schreibt apps.json (und Bilder) direkt im GitHub-Repo.
// Login: Fine-grained Token mit "Contents: Read and write" nur für dieses Repo,
// gespeichert im localStorage dieses Browsers. Alle Änderungen eines
// Speichervorgangs landen als ein Commit auf main (Git-Data-API).
// ==========================================================================

(function () {
  'use strict';

  const REPO = 'ericwinderlich/website';
  const BRANCH = 'main';
  const API = 'https://api.github.com';
  const LS_TOKEN = 'admin-gh-token';
  const LS_GC_CODE = 'admin-gc-code';
  const LS_GC_KEY = 'admin-gc-key';

  const ICONS = ['calendar-blank', 'chart-bar', 'armchair', 'lock-key', 'book-open', 'cards', 'game-controller', 'printer',
    'pencil-simple', 'text-aa', 'lightbulb', 'note', 'arrows-clockwise', 'puzzle-piece', 'cursor-click', 'projector-screen',
    'folder-plus', 'user-circle-dashed', 'user-circle', 'eye-slash', 'laptop', 'prohibit', 'music-notes', 'envelope-simple',
    'check', 'sparkle', 'github-logo'];
  const STATUS = ['Produktiv', 'Aktiv', 'In Arbeit'];
  const LAYOUTS = { wide: 'Breit (ein großes Bild)', split: 'Bild neben Text', phones: 'Mehrere Handys', duo: 'Laptop und Handy' };
  const DEVICES = { desktop: 'Bildschirm', phone: 'Handy', mixed: 'Gemischt (erst Bildschirm, dann Handy)' };

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  const state = {
    token: null,
    apps: [],
    savedJson: '[]',
    appsSha: null,
    files: new Map(),      // Pfad -> { base64, url } (neue oder ersetzte Bilder)
    deletions: new Set(),  // Pfade, die beim Speichern gelöscht werden
    editing: null,         // id der App im Editor
    saving: false,
  };

  // ------------------------------------------------------------------------
  // Hilfen
  // ------------------------------------------------------------------------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* privat */ } }

  let toastTimer = null;
  function toast(msg, ms) {
    const t = $('#a-toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 3500);
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function base64ToUtf8(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  function slug(s) {
    return String(s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  function isDirty() {
    return JSON.stringify(state.apps) !== state.savedJson || state.files.size > 0 || state.deletions.size > 0;
  }

  function imgUrl(path) {
    const f = state.files.get(path);
    if (f) return f.url;
    return '/' + path + '?v=' + Date.now().toString(36).slice(-4);
  }

  // ------------------------------------------------------------------------
  // GitHub
  // ------------------------------------------------------------------------

  async function gh(path, opts) {
    const o = opts || {};
    const res = await fetch(API + path, {
      method: o.method || 'GET',
      headers: {
        Authorization: 'Bearer ' + state.token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(o.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
    if (!res.ok) {
      let msg = res.status + '';
      try { msg += ' ' + ((await res.json()).message || ''); } catch (e) { /* egal */ }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async function checkToken(token) {
    state.token = token;
    const repo = await gh('/repos/' + REPO);
    if (!repo.permissions || !repo.permissions.push) throw new Error('Der Token darf nicht in das Repository schreiben. Bitte bei „Contents“ „Read and write“ einstellen.');
    return true;
  }

  async function loadApps() {
    const c = await gh('/repos/' + REPO + '/contents/apps.json?ref=' + BRANCH);
    state.apps = JSON.parse(base64ToUtf8(c.content));
    state.appsSha = c.sha;
    state.savedJson = JSON.stringify(state.apps);
    state.files.clear();
    state.deletions.clear();
  }

  // Alle Änderungen als ein Commit. Bei gleichzeitigem Bot-Commit wird neu aufgesetzt.
  async function commit(message) {
    const json = JSON.stringify(state.apps, null, 2) + '\n';
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await gh('/repos/' + REPO + '/git/ref/heads/' + BRANCH);
      const headSha = ref.object.sha;
      const head = await gh('/repos/' + REPO + '/git/commits/' + headSha);

      // Wurde apps.json seit dem Laden woanders geändert? Dann nicht überschreiben.
      const current = await gh('/repos/' + REPO + '/contents/apps.json?ref=' + headSha);
      if (current.sha !== state.appsSha) {
        throw new Error('apps.json wurde inzwischen an anderer Stelle geändert. Bitte die Seite neu laden, deine ungespeicherten Änderungen gehen dabei verloren.');
      }

      const tree = [];
      const appsBlob = await gh('/repos/' + REPO + '/git/blobs', { method: 'POST', body: { content: json, encoding: 'utf-8' } });
      tree.push({ path: 'apps.json', mode: '100644', type: 'blob', sha: appsBlob.sha });
      for (const [path, f] of state.files) {
        const b = await gh('/repos/' + REPO + '/git/blobs', { method: 'POST', body: { content: f.base64, encoding: 'base64' } });
        tree.push({ path, mode: '100644', type: 'blob', sha: b.sha });
      }
      for (const path of state.deletions) {
        if (state.files.has(path)) continue;
        tree.push({ path, mode: '100644', type: 'blob', sha: null });
      }

      let newTree;
      try {
        newTree = await gh('/repos/' + REPO + '/git/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree } });
      } catch (e) {
        // Löschen einer Datei, die es nicht (mehr) gibt, lässt den Baum scheitern: ohne Löschungen noch einmal
        if (state.deletions.size) {
          newTree = await gh('/repos/' + REPO + '/git/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree: tree.filter((t) => t.sha !== null) } });
        } else throw e;
      }
      const newCommit = await gh('/repos/' + REPO + '/git/commits', { method: 'POST', body: { message, tree: newTree.sha, parents: [headSha] } });
      try {
        await gh('/repos/' + REPO + '/git/refs/heads/' + BRANCH, { method: 'PATCH', body: { sha: newCommit.sha, force: false } });
      } catch (e) {
        if (e.status === 422 && attempt < 2) continue; // main ist weitergelaufen (Bot): neu aufsetzen
        throw e;
      }
      state.appsSha = appsBlob.sha;
      return newCommit.sha;
    }
    throw new Error('Speichern ist dreimal an gleichzeitigen Änderungen gescheitert. Bitte gleich noch einmal versuchen.');
  }

  // ------------------------------------------------------------------------
  // Bilder im Browser umwandeln
  // ------------------------------------------------------------------------

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
      img.src = url;
    });
  }

  // cover: [w, h] schneidet passend zu; maxW: verkleinert nur
  function toWebp(img, opts) {
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0, w, h;
    if (opts.cover) {
      [w, h] = opts.cover;
      const r = w / h;
      if (sw / sh > r) { const nw = sh * r; sx = (sw - nw) / 2; sw = nw; } else { sh = sw / r; }
    } else {
      const scale = Math.min(1, opts.maxW / sw);
      w = Math.round(sw * scale); h = Math.round(sh * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Umwandeln in WebP hat nicht geklappt.')); return; }
        const fr = new FileReader();
        fr.onload = () => resolve({ base64: String(fr.result).split(',')[1], url: URL.createObjectURL(blob), w, h });
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      }, 'image/webp', 0.82);
    });
  }

  async function addImage(path, file, opts) {
    const { img } = await readImage(file);
    const out = await toWebp(img, opts);
    state.files.set(path, out);
    state.deletions.delete(path);
    return { portrait: img.naturalHeight > img.naturalWidth, out };
  }

  // ------------------------------------------------------------------------
  // Ansichten
  // ------------------------------------------------------------------------

  function show(view) {
    ['login', 'apps', 'edit', 'stats', 'settings'].forEach((v) => { $('#view-' + v).hidden = v !== view; });
    $('#a-tabs').hidden = view === 'login';
    if (view === 'login') $('#savebar').hidden = true; else updateSavebar();
    $$('#a-tabs button').forEach((b) => {
      const on = b.dataset.tab === view || (view === 'edit' && b.dataset.tab === 'apps');
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }

  function updateSavebar() {
    const dirty = isDirty();
    $('#savebar').hidden = !dirty;
    if (dirty) {
      const n = state.files.size;
      $('#savebar-text').textContent = 'Ungespeicherte Änderungen' + (n ? ' (' + n + (n === 1 ? ' neues Bild)' : ' neue Bilder)') : '');
    }
  }

  function renderList() {
    const groups = [['unterricht', 'Apps für den Unterricht'], ['kreas', 'Für KreaS gebaut']];
    $('#apps-list').innerHTML = groups.map(([g, label]) => {
      const list = state.apps.filter((a) => (a.group || 'unterricht') === g);
      return `
        <h2 class="a-group">${label}</h2>
        <ul class="a-list">
          ${list.map((a, i) => `
            <li class="a-row">
              <img src="${esc(imgUrl('img/apps/' + a.id + '-800.webp'))}" alt="" width="120" height="75">
              <div class="a-row-text">
                <strong>${esc(a.title)}</strong>
                <span>${esc(a.status || '')}${a.github ? '' : ' · ohne öffentlichen Code'}</span>
              </div>
              <div class="a-row-actions">
                <button class="a-btn a-btn-icon" type="button" data-move="${esc(a.id)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(a.title)} nach oben">↑</button>
                <button class="a-btn a-btn-icon" type="button" data-move="${esc(a.id)}" data-dir="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="${esc(a.title)} nach unten">↓</button>
                <button class="a-btn" type="button" data-edit="${esc(a.id)}">Bearbeiten</button>
              </div>
            </li>`).join('')}
        </ul>`;
    }).join('');
    $('#apps-note').textContent = state.apps.length + ' Einträge. Reihenfolge und Inhalte gelten genau so auf der Startseite.';
    updateSavebar();
  }

  function move(id, dir) {
    const app = state.apps.find((a) => a.id === id);
    const g = app.group || 'unterricht';
    const idx = state.apps.indexOf(app);
    // nächster Eintrag derselben Gruppe in Richtung dir
    let j = idx + dir;
    while (j >= 0 && j < state.apps.length && (state.apps[j].group || 'unterricht') !== g) j += dir;
    if (j < 0 || j >= state.apps.length) return;
    [state.apps[idx], state.apps[j]] = [state.apps[j], state.apps[idx]];
    renderList();
  }

  // ------------------------------------------------------------------------
  // Editor
  // ------------------------------------------------------------------------

  function iconSelect(name, value) {
    return `<select name="${name}">${ICONS.map((i) => `<option value="${i}" ${i === value ? 'selected' : ''}>${i}</option>`).join('')}</select>`;
  }

  function imagesOf(app) {
    const names = new Set();
    (app.tour || []).forEach((s) => (s.images || []).forEach((n) => names.add(n)));
    for (const p of state.files.keys()) {
      const m = p.match(new RegExp('^img/apps/' + app.id + '/([^/]+)\\.webp$'));
      if (m) names.add(m[1]);
    }
    return [...names];
  }

  function renderEdit(id) {
    const app = state.apps.find((a) => a.id === id);
    state.editing = id;
    const s = app.story || {};
    const p = app.privacy || {};
    const hl = (app.highlights || []).concat([['check', ''], ['check', ''], ['check', ''], ['check', '']]).slice(0, 4);
    const badges = (p.badges || []).concat([['check', ''], ['check', ''], ['check', '']]).slice(0, 3);
    const imgs = imagesOf(app);
    const vids = app.videos || { items: [] };
    const opt = (list, val) => list.map((n) => `<option value="${esc(n)}" ${n === val ? 'selected' : ''}>${esc(n || '(keins)')}</option>`).join('');
    $('#edit-preview').href = '/app.html?id=' + encodeURIComponent(app.id);

    $('#edit-form').innerHTML = `
      <h1>${esc(app.title)}</h1>

      <fieldset>
        <legend>Grunddaten</legend>
        <label>Titel<input name="title" value="${esc(app.title)}" required></label>
        <label>Beschreibung <small>Erscheint auf der Karte und oben auf der App-Seite.</small><textarea name="description" rows="3">${esc(app.description)}</textarea></label>
        <div class="a-cols">
          <label>Bereich<select name="group">
            <option value="unterricht" ${(app.group || 'unterricht') === 'unterricht' ? 'selected' : ''}>Apps für den Unterricht</option>
            <option value="kreas" ${app.group === 'kreas' ? 'selected' : ''}>Für KreaS gebaut</option></select></label>
          <label>Status <small>„In Arbeit“ landet unter „Noch in Arbeit“.</small><select name="status">${opt(STATUS, app.status)}</select></label>
        </div>
        <div class="a-checks">
          <span>Für</span>
          <label><input type="checkbox" name="aud-schueler" ${(app.audience || []).includes('schueler') ? 'checked' : ''}> Schüler:innen</label>
          <label><input type="checkbox" name="aud-lehrkraefte" ${(app.audience || []).includes('lehrkraefte') ? 'checked' : ''}> Lehrkräfte</label>
        </div>
        <label>Adresse der App<input name="web" type="url" value="${esc((app.links || {}).web)}" required></label>
        <label>GitHub-Repository <small>Nur bei öffentlichem Code. Dann gibt es „Nachbauen“, Stand und Commits kommen automatisch.</small><input name="github" type="url" value="${esc(app.github || '')}" placeholder="https://github.com/…"></label>
        <div class="a-cols">
          <label>Gestartet <small>Nur ohne GitHub nötig.</small><input name="started" value="${esc(app.started || '')}" placeholder="Oktober 2026"></label>
          <label>Stand <small>Nur ohne GitHub nötig.</small><input name="lastUpdated" value="${esc(app.lastUpdated || '')}" placeholder="November 2026"></label>
        </div>
        <label>Zeile unter der Beschreibung <small>Optional, zum Beispiel „Ein Angebot von KreaS“.</small><input name="partner" value="${esc(app.partner || '')}"></label>
      </fieldset>

      <fieldset>
        <legend>Bild auf der Karte</legend>
        <div class="a-mainimg">
          <img src="${esc(imgUrl('img/apps/' + app.id + '-800.webp'))}" alt="" width="320" height="200">
          <label class="a-file">Bild ersetzen <small>Wird auf 16:10 zugeschnitten.</small><input type="file" accept="image/*" data-upload="main"></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Warum?</legend>
        <label>Deine Geschichte zur App <small>Leer lassen, dann fehlt der Abschnitt.</small><textarea name="story" rows="4">${esc(s.problem || '')}</textarea></label>
        ${app.github ? `<label>Start-Prompt zum Nachbauen <small>Für „Lieber komplett neu bauen“.</small><textarea name="prompt" rows="6">${esc(s.prompt || '')}</textarea></label>` : ''}
      </fieldset>

      <fieldset>
        <legend>Die vier Funktionen oben</legend>
        ${hl.map((h, i) => `<div class="a-iconrow">${iconSelect('hl-icon-' + i, h[0])}<input name="hl-text-${i}" value="${esc(h[1])}" placeholder="leer = weglassen"></div>`).join('')}
      </fieldset>

      <fieldset>
        <legend>Bilder oben auf der App-Seite</legend>
        <div class="a-cols">
          <label>Großes Bild<select name="hero-desktop">${opt([''].concat(imgs), (app.hero || {}).desktop || '')}</select></label>
          <label>Handy davor<select name="hero-phone">${opt([''].concat(imgs), (app.hero || {}).phone || '')}</select></label>
        </div>
        <small>„(keins)“ beim großen Bild nimmt das Kartenbild.</small>
      </fieldset>

      <fieldset>
        <legend>So sieht sie aus</legend>
        <div id="tour-steps">
          ${(app.tour || []).map((step, i) => `
            <div class="a-step" data-step="${i}">
              <div class="a-step-head">
                <strong>Abschnitt ${i + 1}</strong>
                <span>
                  <button class="a-btn a-btn-icon" type="button" data-step-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Abschnitt nach oben">↑</button>
                  <button class="a-btn a-btn-icon" type="button" data-step-move="${i}" data-dir="1" ${i === app.tour.length - 1 ? 'disabled' : ''} aria-label="Abschnitt nach unten">↓</button>
                  <button class="a-btn a-btn-danger" type="button" data-step-del="${i}">Entfernen</button>
                </span>
              </div>
              <label>Überschrift<input name="step-title-${i}" value="${esc(step.title)}"></label>
              <label>Text<textarea name="step-text-${i}" rows="2">${esc(step.text)}</textarea></label>
              <div class="a-cols">
                <label>Anordnung<select name="step-layout-${i}">${Object.entries(LAYOUTS).map(([k, v]) => `<option value="${k}" ${k === step.layout ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
                <label>Bilder sind<select name="step-device-${i}">${Object.entries(DEVICES).map(([k, v]) => `<option value="${k}" ${k === step.device ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
              </div>
              <div class="a-thumbs">
                ${(step.images || []).map((n, k) => `
                  <figure>
                    <img src="${esc(imgUrl('img/apps/' + app.id + '/' + n + '.webp'))}" alt="" width="120" height="90">
                    <figcaption>${esc(n)} <button class="a-link" type="button" data-img-del="${i}:${k}">entfernen</button></figcaption>
                  </figure>`).join('')}
                <label class="a-file a-file-small">+ Bild<input type="file" accept="image/*" data-upload="step:${i}"></label>
              </div>
            </div>`).join('')}
        </div>
        <button class="a-btn" type="button" id="btn-step-add">+ Abschnitt hinzufügen</button>
      </fieldset>

      <fieldset>
        <legend>Videos</legend>
        <small>YouTube-Videos mit Vorschaubild. Auf der Seite lädt YouTube erst, wenn jemand auf Abspielen klickt.</small>
        <label>Einleitung <small>Optional, steht über den Videos.</small><textarea name="vid-lead" rows="3">${esc(vids.lead || '')}</textarea></label>
        <label>Zeile darunter <small>Optional, zum Beispiel „Video und Schnitt: Eric Winderlich“.</small><input name="vid-credit" value="${esc(vids.credit || '')}"></label>
        ${(vids.items || []).map((vid, i) => `
          <div class="a-step">
            <div class="a-step-head">
              <strong>Video ${i + 1}</strong>
              <span>
                <button class="a-btn a-btn-icon" type="button" data-vid-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Video nach oben">↑</button>
                <button class="a-btn a-btn-icon" type="button" data-vid-move="${i}" data-dir="1" ${i === vids.items.length - 1 ? 'disabled' : ''} aria-label="Video nach unten">↓</button>
                <button class="a-btn a-btn-danger" type="button" data-vid-del="${i}">Entfernen</button>
              </span>
            </div>
            <div class="a-mainimg">
              <img src="${esc(imgUrl('img/videos/' + vid.youtube + '.webp'))}" alt="" width="240" height="135">
              <a href="https://www.youtube.com/watch?v=${encodeURIComponent(vid.youtube)}" target="_blank" rel="noopener">Auf YouTube ansehen</a>
            </div>
            <label>Titel<input name="vid-title-${i}" value="${esc(vid.title)}"></label>
            <label>Text<textarea name="vid-text-${i}" rows="2">${esc(vid.text)}</textarea></label>
          </div>`).join('')}
        <div class="a-addvideo">
          <label>Neues Video <small>YouTube-Link einfügen, Titel und Vorschaubild holt der Admin selbst.</small><input id="vid-new" type="url" placeholder="https://www.youtube.com/watch?v=…"></label>
          <button class="a-btn" type="button" id="btn-vid-add">Video hinzufügen</button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Datenschutz</legend>
        <label>Ein Satz zusammengefasst<input name="p-summary" value="${esc(p.summary || '')}"></label>
        ${badges.map((b, i) => `<div class="a-iconrow">${iconSelect('b-icon-' + i, b[0])}<input name="b-text-${i}" value="${esc(b[1])}" placeholder="Symbol-Text, leer = weglassen"></div>`).join('')}
        <label>Details <small>Ein Punkt pro Zeile.</small><textarea name="p-points" rows="5">${esc((p.points || []).join('\n'))}</textarea></label>
        <label>Link zur vollständigen Datenschutzerklärung <small>Optional.</small><input name="p-link" type="url" value="${esc(p.link || '')}"></label>
      </fieldset>

      <fieldset class="a-danger">
        <legend>Löschen</legend>
        <p>Entfernt ${esc(app.title)} samt Bildern von der Website. Erst beim Speichern endgültig.</p>
        <button class="a-btn a-btn-danger" type="button" id="btn-delete">${esc(app.title)} löschen</button>
      </fieldset>`;
    show('edit');
  }

  // Formular zurück ins App-Objekt schreiben
  function collect() {
    const app = state.apps.find((a) => a.id === state.editing);
    if (!app) return;
    const f = $('#edit-form');
    const v = (n) => { const el = f.elements[n]; return el ? el.value.trim() : ''; };
    app.title = v('title');
    app.description = v('description');
    app.group = v('group');
    app.status = v('status');
    app.audience = [f.elements['aud-schueler'].checked && 'schueler', f.elements['aud-lehrkraefte'].checked && 'lehrkraefte'].filter(Boolean);
    app.links = Object.assign({}, app.links, { web: v('web') });
    if (v('github')) { app.github = v('github'); app.isOpenSource = true; } else { delete app.github; app.isOpenSource = false; }
    ['started', 'lastUpdated', 'partner'].forEach((k) => { if (v(k)) app[k] = v(k); else delete app[k]; });
    app.story = Object.assign({}, app.story, { problem: v('story') });
    if (f.elements.prompt) app.story.prompt = v('prompt');
    app.highlights = [0, 1, 2, 3].map((i) => [v('hl-icon-' + i), v('hl-text-' + i)]).filter((h) => h[1]);
    const hero = {};
    if (v('hero-desktop')) hero.desktop = v('hero-desktop');
    if (v('hero-phone')) hero.phone = v('hero-phone');
    app.hero = hero;
    (app.tour || []).forEach((step, i) => {
      step.title = v('step-title-' + i);
      step.text = v('step-text-' + i);
      step.layout = v('step-layout-' + i);
      step.device = v('step-device-' + i);
    });
    app.privacy = Object.assign({}, app.privacy, {
      summary: v('p-summary'),
      badges: [0, 1, 2].map((i) => [v('b-icon-' + i), v('b-text-' + i)]).filter((b) => b[1]),
      points: v('p-points').split('\n').map((x) => x.trim()).filter(Boolean),
    });
    if (v('p-link')) app.privacy.link = v('p-link'); else delete app.privacy.link;
    if (app.videos) {
      app.videos.lead = v('vid-lead');
      if (v('vid-credit')) app.videos.credit = v('vid-credit'); else delete app.videos.credit;
      (app.videos.items || []).forEach((vid, i) => { vid.title = v('vid-title-' + i); vid.text = v('vid-text-' + i); });
      if (!app.videos.items.length && !app.videos.lead && !app.videos.credit) delete app.videos;
    }
    updateSavebar();
  }

  async function handleUpload(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const app = state.apps.find((a) => a.id === state.editing);
    const kind = input.dataset.upload;
    try {
      input.disabled = true;
      if (kind === 'main') {
        await addImage('img/apps/' + app.id + '.webp', file, { cover: [1280, 800] });
        await addImage('img/apps/' + app.id + '-800.webp', file, { cover: [800, 500] });
      } else {
        const i = Number(kind.split(':')[1]);
        const step = app.tour[i];
        const base = slug(step.title || 'bild') || 'bild';
        let name = base, n = 2;
        const taken = new Set(imagesOf(app));
        while (taken.has(name)) name = base + '-' + n++;
        const probe = await readImage(file);
        const portrait = probe.img.naturalHeight > probe.img.naturalWidth;
        await addImage('img/apps/' + app.id + '/' + name + '.webp', file, { maxW: portrait ? 780 : 1280 });
        step.images = (step.images || []).concat(name);
        if (step.images.length === 1) step.device = portrait ? 'phone' : 'desktop';
      }
      collect();
      renderEdit(app.id);
      toast('Bild übernommen. Gespeichert wird erst mit „Speichern und veröffentlichen“.');
    } catch (e) {
      toast(e.message || 'Das Bild ging nicht.');
    } finally {
      input.disabled = false;
    }
  }

  function youtubeId(url) {
    const s = String(url || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
    return m ? m[1] : null;
  }

  function videoUsedElsewhere(id, exceptApp) {
    return state.apps.some((a) => a !== exceptApp && ((a.videos || {}).items || []).some((x) => x.youtube === id));
  }

  async function addVideo(app, url) {
    const id = youtubeId(url);
    if (!id) throw new Error('Das ist kein YouTube-Link. Erwartet wird z. B. https://www.youtube.com/watch?v=…');
    app.videos = app.videos || { items: [] };
    app.videos.items = app.videos.items || [];
    if (app.videos.items.some((x) => x.youtube === id)) throw new Error('Dieses Video ist schon drin.');
    // Titel vorausfüllen (öffentliche oEmbed-Schnittstelle von YouTube)
    let title = '';
    try {
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
      if (r.ok) title = (await r.json()).title || '';
    } catch (e) { /* Titel dann von Hand */ }
    // Vorschaubild holen, auf 16:9 zuschneiden und lokal ablegen
    const path = 'img/videos/' + id + '.webp';
    let exists = false;
    if (!state.deletions.has(path)) {
      try { exists = (await fetch('/' + path, { method: 'HEAD', cache: 'no-store' })).ok; } catch (e) { exists = false; }
    }
    if (!state.files.has(path) && !exists) {
      let blob = null;
      for (const q of ['maxresdefault', 'sddefault', 'hqdefault']) {
        try {
          const r = await fetch('https://i.ytimg.com/vi/' + id + '/' + q + '.jpg');
          if (r.ok) { blob = await r.blob(); break; }
        } catch (e) { /* nächste Größe */ }
      }
      if (!blob) throw new Error('Das Vorschaubild ließ sich nicht laden. Ist das Video öffentlich?');
      const { img } = await readImage(blob);
      state.files.set(path, await toWebp(img, { cover: [1280, 720] }));
      state.deletions.delete(path);
    }
    app.videos.items.push({ youtube: id, title, text: '' });
  }

  function newApp() {
    const title = prompt('Name der neuen App:');
    if (!title) return;
    let id = slug(title);
    if (!id) { toast('Bitte einen Namen mit Buchstaben eingeben.'); return; }
    while (state.apps.some((a) => a.id === id)) id += '-2';
    state.apps.push({
      id, title, group: 'unterricht', description: '', status: 'In Arbeit', audience: ['schueler'], isOpenSource: false,
      links: { web: '' }, highlights: [], hero: {}, tour: [],
      privacy: { summary: '', badges: [], points: [] }, story: { problem: '' },
    });
    renderEdit(id);
    toast('Neue App angelegt. Bitte Adresse, Text und ein Kartenbild ergänzen.');
  }

  function deleteApp() {
    const app = state.apps.find((a) => a.id === state.editing);
    if (!confirm(app.title + ' wirklich löschen? Das wird erst beim Speichern endgültig.')) return;
    ['img/apps/' + app.id + '.webp', 'img/apps/' + app.id + '-800.webp']
      .concat(imagesOf(app).map((n) => 'img/apps/' + app.id + '/' + n + '.webp'))
      .concat(((app.videos || {}).items || []).filter((x) => !videoUsedElsewhere(x.youtube, app)).map((x) => 'img/videos/' + x.youtube + '.webp'))
      .forEach((p) => { if (state.files.has(p)) state.files.delete(p); else state.deletions.add(p); });
    state.apps = state.apps.filter((a) => a !== app);
    state.editing = null;
    renderList();
    show('apps');
  }

  function validate() {
    const ids = new Set();
    for (const a of state.apps) {
      if (!a.title) return 'Eine App hat keinen Titel.';
      if (!a.links || !/^https:\/\//.test(a.links.web || '')) return '„' + a.title + '“ braucht eine Adresse, die mit https:// beginnt.';
      if (ids.has(a.id)) return 'Zwei Apps haben dieselbe Kennung: ' + a.id;
      ids.add(a.id);
      const hasMain = state.files.has('img/apps/' + a.id + '-800.webp') || state.savedJson.includes('"id": "' + a.id + '"') || state.savedJson.includes('"id":"' + a.id + '"');
      if (!hasMain) return '„' + a.title + '“ braucht noch ein Kartenbild.';
    }
    return null;
  }

  async function save() {
    if (state.saving) return;
    if ($('#view-edit').hidden === false) collect();
    const err = validate();
    if (err) { toast(err, 6000); return; }
    state.saving = true;
    const btn = $('#btn-save');
    btn.disabled = true;
    btn.textContent = 'Speichert …';
    try {
      const n = state.files.size;
      await commit('Admin: Inhalte geändert' + (n ? ' (' + n + ' Bild' + (n === 1 ? ')' : 'er)') : ''));
      state.savedJson = JSON.stringify(state.apps);
      state.files.clear();
      state.deletions.clear();
      renderList();
      toast('Gespeichert. In etwa einer Minute ist es online.', 6000);
    } catch (e) {
      toast('Speichern hat nicht geklappt: ' + e.message, 9000);
    } finally {
      state.saving = false;
      btn.disabled = false;
      btn.textContent = 'Speichern und veröffentlichen';
    }
  }

  // ------------------------------------------------------------------------
  // Statistik (GoatCounter)
  // ------------------------------------------------------------------------

  function isoHour(d) { const x = new Date(d); x.setMinutes(0, 0, 0); return x.toISOString(); }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // GoatCounter erlaubt nur wenige Anfragen pro Sekunde: nacheinander abrufen, bei 429 warten und neu versuchen
  async function gc(code, key, path) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch('https://' + code + '.goatcounter.com/api/v0' + path, { headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' } });
      if (res.ok) return res.json();
      if (res.status === 429 && attempt < 3) {
        const reset = Number(res.headers.get('X-Rate-Limit-Reset'));
        await sleep(reset > 0 && reset < 30 ? reset * 1000 + 250 : 1500 * (attempt + 1));
        continue;
      }
      const err = new Error(String(res.status));
      err.status = res.status;
      throw err;
    }
    throw Object.assign(new Error('429'), { status: 429 });
  }

  const STATS_CACHE = 'admin-gc-cache';
  async function renderStats(force) {
    const body = $('#stats-body');
    const code = lsGet(LS_GC_CODE), key = lsGet(LS_GC_KEY);
    if (!code || !key) {
      body.innerHTML = '<p>Noch nicht eingerichtet. Trag unter <a href="#" data-goto="settings">Einstellungen</a> deinen GoatCounter-Code und einen API-Schlüssel ein.</p>';
      return;
    }
    const dash = 'https://' + encodeURIComponent(code) + '.goatcounter.com';
    body.innerHTML = '<p>Lädt …</p>';
    const now = Date.now();
    const range = (days) => '?start=' + encodeURIComponent(isoHour(now - days * 864e5)) + '&end=' + encodeURIComponent(isoHour(now + 36e5));
    try {
      // Zahlen 5 Minuten zwischenspeichern, damit Hin- und Herwechseln keine neuen Abrufe auslöst
      let data = null;
      try { data = JSON.parse(sessionStorage.getItem(STATS_CACHE) || 'null'); } catch (e) { data = null; }
      if (force || !data || data.code !== code || now - data.at > 5 * 60e3) {
        const t7 = await gc(code, key, '/stats/total' + range(7));
        await sleep(350);
        const t30 = await gc(code, key, '/stats/total' + range(30));
        await sleep(350);
        const hits = await gc(code, key, '/stats/hits' + range(30) + '&limit=10');
        await sleep(350);
        const refs = await gc(code, key, '/stats/toprefs' + range(30) + '&limit=10');
        data = { code, at: now, t7, t30, hits, refs };
        try { sessionStorage.setItem(STATS_CACHE, JSON.stringify(data)); } catch (e) { /* egal */ }
      }
      const { t7, t30, hits, refs } = data;
      const num = (t) => Number((t && (t.total_unique ?? t.total)) || 0).toLocaleString('de-DE');
      // Seiten lesbar benennen: Startseite, App-Seiten mit App-Namen, sonst der Pfad
      const pageName = (x) => {
        const path = String(x.path || '');
        if (path === '/' || path === '/index.html') return 'Startseite';
        const m = path.match(/[?&]id=([^&#]+)/);
        if (m) {
          const app = state.apps.find((a) => a.id === decodeURIComponent(m[1]));
          if (app) return app.title;
        }
        if (/datenschutz/.test(path)) return 'Datenschutz';
        if (/404/.test(path)) return 'Seite nicht gefunden (404)';
        return path || String(x.title || '').replace(/\s*\|\s*Eric Winderlich\s*/g, '').replace(/^Eric Winderlich\s*\|\s*/, '');
      };
      const refName = (x) => (x.name ? String(x.name).replace(/^https?:\/\//, '').replace(/\/$/, '') : 'Direkt aufgerufen');
      const list = (items, name) => items && items.length
        ? '<ol class="a-rank">' + items.map((x) => `<li><span>${esc(name(x))}</span><strong>${esc(Number(x.count || 0).toLocaleString('de-DE'))}</strong></li>`).join('') + '</ol>'
        : '<p class="a-empty">Noch keine Daten.</p>';
      const stamp = new Date(data.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      body.innerHTML = `
        <div class="a-kpis">
          <div><span>Besucher, letzte 7 Tage</span><strong>${num(t7)}</strong></div>
          <div><span>Besucher, letzte 30 Tage</span><strong>${num(t30)}</strong></div>
        </div>
        <div class="a-cols">
          <section class="a-box"><h2>Beliebteste Seiten</h2><p class="a-sub">letzte 30 Tage</p>${list(hits.hits, pageName)}</section>
          <section class="a-box"><h2>Woher die Besucher kommen</h2><p class="a-sub">letzte 30 Tage</p>${list(refs.stats, refName)}</section>
        </div>
        <div class="a-statsfoot">
          <span>Stand ${stamp} Uhr</span>
          <button class="a-btn" type="button" id="btn-stats-reload">Neu laden</button>
          <a class="a-btn" href="${dash}" target="_blank" rel="noopener">Ausführliche Statistik bei GoatCounter</a>
        </div>`;
    } catch (e) {
      const why = e.status === 401 || e.status === 403
        ? 'GoatCounter lehnt den API-Schlüssel ab. Bitte unter Einstellungen prüfen, ob er vollständig kopiert ist.'
        : e.status === 429
          ? 'GoatCounter meldet gerade zu viele Abrufe. Bitte eine Minute warten und dann neu laden.'
          : e.status === 404
            ? 'Unter diesem Code gibt es keine Statistik. Bitte den Code unter Einstellungen prüfen.'
            : 'GoatCounter ist gerade nicht erreichbar (' + esc(e.message) + ').';
      body.innerHTML = `<p>${why}</p>
        <p><button class="a-btn" type="button" id="btn-stats-reload">Neu laden</button> <a class="a-btn a-btn-primary" href="${dash}" target="_blank" rel="noopener">Statistik bei GoatCounter öffnen</a></p>`;
    }
  }

  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-stats-reload') renderStats(true);
  });

  // ------------------------------------------------------------------------
  // Start und Ereignisse
  // ------------------------------------------------------------------------

  async function enter() {
    try {
      await loadApps();
      renderList();
      show('apps');
    } catch (e) {
      if (e.status === 401) {
        lsSet(LS_TOKEN, null);
        showLogin('Der gespeicherte Token gilt nicht mehr (abgelaufen oder gelöscht). Bitte einen neuen einfügen.');
      } else {
        showLogin('GitHub antwortet gerade nicht: ' + e.message);
      }
    }
  }

  function showLogin(msg) {
    show('login');
    const er = $('#login-error');
    er.hidden = !msg;
    er.textContent = msg || '';
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $('#login-token').value.trim();
    const btn = e.submitter || $('#login-form button');
    btn.disabled = true;
    try {
      await checkToken(token);
      lsSet(LS_TOKEN, token);
      $('#login-token').value = '';
      await enter();
    } catch (err) {
      state.token = null;
      showLogin(err.status === 401 ? 'Der Token stimmt nicht. Bitte noch einmal kopieren.' : err.status === 404 ? 'Der Token hat keinen Zugriff auf ericwinderlich/website. Bitte das Repository beim Token auswählen.' : err.message);
    } finally {
      btn.disabled = false;
    }
  });

  $('#a-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    if (b.dataset.tab === 'apps') { if (!$('#view-edit').hidden) collect(); renderList(); show('apps'); }
    if (b.dataset.tab === 'stats') { show('stats'); renderStats(); }
    if (b.dataset.tab === 'settings') {
      $('#gc-code').value = lsGet(LS_GC_CODE) || '';
      $('#gc-key').value = lsGet(LS_GC_KEY) || '';
      $('#gc-saved').hidden = true;
      show('settings');
    }
  });

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) { e.preventDefault(); $('#a-tabs [data-tab="' + go.dataset.goto + '"]').click(); }
  });

  $('#apps-list').addEventListener('click', (e) => {
    const m = e.target.closest('[data-move]');
    if (m) { move(m.dataset.move, Number(m.dataset.dir)); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) renderEdit(ed.dataset.edit);
  });

  $('#btn-new').addEventListener('click', newApp);
  $('#btn-save').addEventListener('click', save);
  $('#btn-discard').addEventListener('click', () => {
    if (!confirm('Alle ungespeicherten Änderungen verwerfen?')) return;
    state.apps = JSON.parse(state.savedJson);
    state.files.clear();
    state.deletions.clear();
    state.editing = null;
    renderList();
    show('apps');
  });
  $('#btn-back').addEventListener('click', () => { collect(); renderList(); show('apps'); });

  const form = $('#edit-form');
  form.addEventListener('input', collect);
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'vid-new') { e.preventDefault(); $('#btn-vid-add').click(); }
  });
  form.addEventListener('change', (e) => {
    if (e.target.matches('input[type=file]')) { handleUpload(e.target); return; }
    collect();
  });
  form.addEventListener('click', (e) => {
    const app = state.apps.find((a) => a.id === state.editing);
    if (!app) return;
    const t = e.target;
    if (t.id === 'btn-delete') { deleteApp(); return; }
    if (t.id === 'btn-step-add') {
      collect();
      app.tour = (app.tour || []).concat({ layout: 'split', device: 'desktop', images: [], title: 'Neuer Abschnitt', text: '' });
      renderEdit(app.id);
      return;
    }
    if (t.dataset.stepDel != null) {
      collect();
      app.tour.splice(Number(t.dataset.stepDel), 1);
      renderEdit(app.id);
      return;
    }
    if (t.dataset.stepMove != null) {
      collect();
      const i = Number(t.dataset.stepMove), j = i + Number(t.dataset.dir);
      [app.tour[i], app.tour[j]] = [app.tour[j], app.tour[i]];
      renderEdit(app.id);
      return;
    }
    if (t.id === 'btn-vid-add') {
      collect();
      const input = $('#vid-new');
      t.disabled = true;
      addVideo(app, input.value)
        .then(() => { renderEdit(app.id); toast('Video übernommen. Gespeichert wird erst mit „Speichern und veröffentlichen“.'); })
        .catch((err) => { toast(err.message, 6000); t.disabled = false; });
      return;
    }
    if (t.dataset.vidDel != null) {
      collect();
      const i = Number(t.dataset.vidDel);
      const [gone] = app.videos.items.splice(i, 1);
      if (!videoUsedElsewhere(gone.youtube, app)) {
        const path = 'img/videos/' + gone.youtube + '.webp';
        if (state.files.has(path)) state.files.delete(path); else state.deletions.add(path);
      }
      renderEdit(app.id);
      return;
    }
    if (t.dataset.vidMove != null) {
      collect();
      const i = Number(t.dataset.vidMove), k = i + Number(t.dataset.dir);
      [app.videos.items[i], app.videos.items[k]] = [app.videos.items[k], app.videos.items[i]];
      renderEdit(app.id);
      return;
    }
    if (t.dataset.imgDel) {
      collect();
      const [i, k] = t.dataset.imgDel.split(':').map(Number);
      const name = app.tour[i].images[k];
      app.tour[i].images.splice(k, 1);
      const stillUsed = app.tour.some((s) => (s.images || []).includes(name));
      if (!stillUsed) {
        const path = 'img/apps/' + app.id + '/' + name + '.webp';
        if (state.files.has(path)) state.files.delete(path); else state.deletions.add(path);
      }
      renderEdit(app.id);
    }
  });

  $('#gc-form').addEventListener('submit', (e) => {
    e.preventDefault();
    lsSet(LS_GC_CODE, $('#gc-code').value.trim().replace(/\.goatcounter\.com.*$/, '').replace(/^https?:\/\//, ''));
    lsSet(LS_GC_KEY, $('#gc-key').value.trim());
    $('#gc-saved').hidden = false;
  });

  $('#btn-logout').addEventListener('click', () => {
    if (isDirty() && !confirm('Es gibt ungespeicherte Änderungen. Trotzdem abmelden?')) return;
    [LS_TOKEN, LS_GC_CODE, LS_GC_KEY].forEach((k) => lsSet(k, null));
    state.token = null;
    showLogin('Abgemeldet.');
  });

  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  // Los
  const saved = lsGet(LS_TOKEN);
  if (saved) { state.token = saved; enter(); } else showLogin();
})();
