// ==========================================================================
// ericwinderlich.de
// Inhalte kommen aus apps.json. Neue App = neuer Eintrag dort, Screenshot
// unter img/apps/<id>.webp ablegen (1280x800). Stand und Commits schreibt
// die GitHub Action täglich nach data/repos.json.
//
// Seiten (body data-page): home, app (app.html?id=...), legal, 404
// ==========================================================================

(function () {
  'use strict';

  const root = document.documentElement;
  const page = document.body.dataset.page || 'home';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const $ = (sel) => document.querySelector(sel);

  const AUDIENCES = {
    all: () => true,
    schueler: (app) => (app.audience || []).includes('schueler'),
    lehrkraefte: (app) => (app.audience || []).includes('lehrkraefte'),
  };
  const AUDIENCE_LABEL = { schueler: 'Schüler:innen', lehrkraefte: 'Lehrkräfte' };

  // ------------------------------------------------------------------------
  // Hilfsfunktionen
  // ------------------------------------------------------------------------

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function icon(name, cls) {
    return `<svg class="icon ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  }

  const toastEl = $('#toast');
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  function copyText(text, okMsg) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? okMsg : 'Kopieren hat nicht geklappt. Bitte von Hand markieren.');
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback);
    } else {
      fallback();
    }
  }

  function isWip(app) {
    return (app.status || '').toLowerCase() === 'in arbeit';
  }

  function formatDate(iso, opts) {
    return new Intl.DateTimeFormat('de-DE', opts || { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(iso));
  }

  function hostOf(url) {
    return (url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  // apps.json und data/repos.json zusammen laden
  function loadData() {
    const get = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    return Promise.all([get('/apps.json'), get('/data/repos.json').catch(() => ({}))])
      .then(([data, repos]) => ({
        apps: data.filter((a) => a.links && a.links.web),
        repos,
      }));
  }

  function standOf(app, repos) {
    const r = repos[app.id];
    if (r && r.pushed) return formatDate(r.pushed);
    return app.lastUpdated || '';
  }

  // ------------------------------------------------------------------------
  // Theme: Heft (hell) und Tafel (dunkel)
  // ------------------------------------------------------------------------

  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const themeBtn = $('#theme-toggle');
  const themeListeners = [];

  function currentTheme() {
    return root.dataset.theme || (darkQuery.matches ? 'dark' : 'light');
  }

  function syncTheme() {
    const dark = currentTheme() === 'dark';
    root.classList.toggle('is-dark', dark);
    if (themeBtn) {
      themeBtn.querySelector('.theme-toggle-label').textContent = dark ? 'Heft' : 'Tafel';
      themeBtn.setAttribute('aria-label', dark ? 'Heft-Modus einschalten' : 'Tafel-Modus einschalten');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#1f2b26' : '#f6f7f4');
    themeListeners.forEach((fn) => fn());
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* privat-Modus */ }
      syncTheme();
    });
  }

  darkQuery.addEventListener('change', () => {
    let stored = null;
    try { stored = localStorage.getItem('theme'); } catch (e) { stored = null; }
    if (!stored) syncTheme();
  });

  // ------------------------------------------------------------------------
  // Karopapier, das unter der Maus nachgibt
  // ------------------------------------------------------------------------

  function initGrid(canvas) {
    const area = canvas.parentElement;
    const ctx = canvas.getContext('2d');
    const CELL = 26;
    const STEP = 13;
    const RADIUS = 180;
    const PUSH = 18;

    let w = 0, h = 0, color = 'rgba(0,0,0,.1)';
    const target = { x: 0, y: 0, amp: 0 };
    const cur = { x: 0, y: 0, amp: 0 };
    let raf = null;
    let visible = true;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function displace(x, y) {
      if (cur.amp < 0.01) return [x, y];
      const dx = x - cur.x;
      const dy = y - cur.y;
      const d = Math.hypot(dx, dy);
      if (d >= RADIUS || d === 0) return [x, y];
      const f = Math.pow(1 - d / RADIUS, 2) * PUSH * cur.amp;
      return [x + (dx / d) * f, y + (dy / d) * f];
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const ox = (w % CELL) / 2;
      for (let x = ox; x <= w; x += CELL) {
        let p = displace(x, -STEP);
        ctx.moveTo(p[0], p[1]);
        for (let y = 0; y <= h + STEP; y += STEP) {
          p = displace(x, y);
          ctx.lineTo(p[0], p[1]);
        }
      }
      for (let y = 0; y <= h; y += CELL) {
        let p = displace(-STEP, y);
        ctx.moveTo(p[0], p[1]);
        for (let x = 0; x <= w + STEP; x += STEP) {
          p = displace(x, y);
          ctx.lineTo(p[0], p[1]);
        }
      }
      ctx.stroke();
    }

    function tick() {
      cur.x += (target.x - cur.x) * 0.14;
      cur.y += (target.y - cur.y) * 0.14;
      cur.amp += (target.amp - cur.amp) * 0.08;
      draw();
      const settled = Math.abs(target.x - cur.x) < 0.3 && Math.abs(target.y - cur.y) < 0.3 &&
        Math.abs(target.amp - cur.amp) < 0.005;
      raf = settled || !visible ? null : requestAnimationFrame(tick);
    }

    function kick() {
      if (!raf && visible) raf = requestAnimationFrame(tick);
    }

    if (finePointer && !reduceMotion) {
      area.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        target.x = e.clientX - r.left;
        target.y = e.clientY - r.top;
        if (target.amp === 0) { cur.x = target.x; cur.y = target.y; }
        target.amp = 1;
        kick();
      });
      area.addEventListener('pointerleave', () => { target.amp = 0; kick(); });
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) kick();
      }).observe(area);
    }

    window.addEventListener('resize', resize);
    themeListeners.push(() => {
      color = getComputedStyle(root).getPropertyValue('--grid').trim() || color;
      draw();
    });
    resize();
  }

  // ------------------------------------------------------------------------
  // Startseite: Hero
  // ------------------------------------------------------------------------

  function initHello() {
    const el = $('#hello-word');
    const words = ['Hallo', 'Hola', 'Hello'];
    let i = 0;
    let swaps = 0;
    if (!el || reduceMotion) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      // Nach zwei Runden bleibt es bei "Hallo", damit nichts dauerhaft zappelt
      if (++swaps > words.length * 2) { clearInterval(timer); return; }
      el.classList.add('out');
      setTimeout(() => {
        i = (i + 1) % words.length;
        el.textContent = words[i];
        el.classList.remove('out');
      }, 300);
    }, 2600);
  }

  function initStack() {
    const stack = $('#hero-stack');
    if (!stack) return;
    const cards = Array.from(stack.querySelectorAll('.stack-card'));
    let hovering = false;
    let seen = true;
    let autoLeft = 3;
    let timer = null;

    function advance() {
      cards.forEach((c) => {
        c.dataset.pos = String((Number(c.dataset.pos) + 2) % cards.length);
      });
    }

    stack.addEventListener('click', () => { clearInterval(timer); advance(); });
    stack.addEventListener('pointerenter', () => { hovering = true; });
    stack.addEventListener('pointerleave', () => { hovering = false; });

    if (reduceMotion) return;
    new IntersectionObserver((e) => { seen = e[0].isIntersecting; }).observe(stack);
    timer = setInterval(() => {
      if (hovering || !seen || document.hidden) return;
      advance();
      if (--autoLeft <= 0) clearInterval(timer);
    }, 5000);
  }

  // ------------------------------------------------------------------------
  // Startseite: Apps als Bento-Raster
  // ------------------------------------------------------------------------

  // Welche Kachelgröße bekommt welche App? Hängt davon ab, wie viele sichtbar sind.
  function slotsFor(count, wip) {
    if (count === 0) return [];
    if (wip) {
      if (count === 1) return ['wide'];
      const s = Array(count).fill('half');
      if (count % 2) s[count - 1] = 'wide';
      return s;
    }
    if (count === 1) return ['wide'];
    if (count === 2) return ['major', 'minor'];
    const s = ['feature', 'side', 'side'];
    const rest = count - 3;
    for (let i = 0; i < rest; i++) s.push('half');
    if (rest % 2) s[s.length - 1] = 'wide';
    return s;
  }

  function cardHTML(app, slot, index, repos) {
    const url = app.links.web;
    const detail = `/app.html?id=${encodeURIComponent(app.id)}`;
    const stand = standOf(app, repos);
    return `
      <article class="app-card slot-${slot}${isWip(app) ? ' is-wip' : ''}" style="view-transition-name: app-${esc(app.id)}; --i: ${index}">
        <figure class="app-shot">
          <div class="frame-bar" aria-hidden="true"><i></i><i></i><i></i><span>${esc(hostOf(url))}</span></div>
          <img src="/img/apps/${esc(app.id)}-800.webp" srcset="/img/apps/${esc(app.id)}-800.webp 800w, /img/apps/${esc(app.id)}.webp 1280w" sizes="(max-width: 860px) 92vw, 640px" width="1280" height="800" loading="lazy" decoding="async" alt="Screenshot: ${esc(app.title)}">
        </figure>
        <div class="app-body">
          <h3 class="app-title">
            <a class="app-link" href="${detail}">${esc(app.title)}</a>
            ${icon('arrow-up-right', 'app-arrow')}
          </h3>
          <p class="app-desc">${esc(app.description)}</p>
          <div class="app-meta">
            ${stand ? `<span class="app-updated">Stand: ${esc(stand)}</span>` : ''}
            <div class="app-actions">
              <a class="app-btn app-btn-open" href="${esc(url)}" target="_blank" rel="noopener">App öffnen</a>
              <a class="app-btn" href="${detail}#nachbauen">${icon('github-logo')}Nachbauen</a>
            </div>
          </div>
        </div>
      </article>`;
  }

  function initHome() {
    initGrid($('#hero-grid'));
    initHello();
    initStack();
    initSectionSpy();

    const gridEl = $('#apps-grid');
    let state = { apps: [], repos: {} };

    function render(list) {
      if (!list.length) {
        gridEl.innerHTML = '<div class="grid-msg"><p>In dieser Kategorie gibt es noch keine Apps.</p></div>';
        return;
      }
      const stable = list.filter((a) => !isWip(a));
      const wip = list.filter(isWip);
      let html = '';
      let n = 0;
      slotsFor(stable.length, false).forEach((slot, i) => { html += cardHTML(stable[i], slot, n++, state.repos); });
      if (wip.length) {
        html += '<p class="wip-heading">Noch in Arbeit</p>';
        slotsFor(wip.length, true).forEach((slot, i) => { html += cardHTML(wip[i], slot, n++, state.repos); });
      }
      gridEl.innerHTML = html;
    }

    function renderAnimated(list) {
      if (document.startViewTransition && !reduceMotion) {
        document.startViewTransition(() => render(list));
      } else {
        render(list);
        if (!reduceMotion) gridEl.querySelectorAll('.app-card').forEach((c) => c.classList.add('enter'));
      }
    }

    // Filter steht in der URL (?fuer=schueler), damit man gefilterte Links teilen kann
    function audienceFromUrl() {
      const a = new URLSearchParams(location.search).get('fuer');
      return AUDIENCES[a] ? a : 'all';
    }

    const tabs = Array.from(document.querySelectorAll('.tab'));
    function selectTab(audience) {
      tabs.forEach((t) => {
        t.setAttribute('aria-selected', String(t.dataset.audience === audience));
        t.tabIndex = t.dataset.audience === audience ? 0 : -1;
      });
    }
    selectTab(audienceFromUrl());
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        if (tab.getAttribute('aria-selected') === 'true') return;
        const audience = tab.dataset.audience;
        selectTab(audience);
        const url = new URL(location.href);
        if (audience === 'all') url.searchParams.delete('fuer');
        else url.searchParams.set('fuer', audience);
        history.replaceState(null, '', url);
        renderAnimated(state.apps.filter(AUDIENCES[audience]));
      });
    });
    tabs[0].parentElement.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    });

    function load() {
      gridEl.setAttribute('aria-busy', 'true');
      loadData()
        .then((data) => {
          state = data;
          render(data.apps.filter(AUDIENCES[audienceFromUrl()]));
          gridEl.setAttribute('aria-busy', 'false');
        })
        .catch(() => {
          gridEl.setAttribute('aria-busy', 'false');
          gridEl.innerHTML = `
            <div class="grid-msg">
              <p>Die App-Liste konnte nicht geladen werden. Prüf deine Verbindung und versuch es noch einmal.</p>
              <button class="btn btn-secondary" type="button" id="retry-btn">Neu laden</button>
            </div>`;
          $('#retry-btn').addEventListener('click', load);
        });
    }
    load();

    $('#prompt-copy').addEventListener('click', () => copyText($('#prompt-text').textContent.trim(), 'Prompt kopiert'));
  }

  function initSectionSpy() {
    const links = Array.from(document.querySelectorAll('.nav-links a'));
    const byId = {};
    links.forEach((a) => { byId[a.getAttribute('href').replace(/^\/?#/, '')] = a; });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.removeAttribute('aria-current'));
        const a = byId[entry.target.id];
        if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['apps', 'making-of', 'kontakt'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    // Im Hero ist nichts markiert
    new IntersectionObserver((e) => {
      if (e[0].isIntersecting) links.forEach((a) => a.removeAttribute('aria-current'));
    }, { rootMargin: '-45% 0px -50% 0px' }).observe($('.hero'));
  }

  // ------------------------------------------------------------------------
  // App-Detailseite (app.html?id=...)
  // ------------------------------------------------------------------------

  // Screenshot im passenden Rahmen: Browserfenster oder Handy
  function shotHTML(app, name, device, lazy) {
    const src = name ? `/img/apps/${esc(app.id)}/${esc(name)}.webp` : `/img/apps/${esc(app.id)}.webp`;
    const loading = lazy ? 'loading="lazy" decoding="async"' : 'fetchpriority="high"';
    if (device === 'phone') {
      return `<div class="phone"><img src="${src}" width="390" height="844" ${loading} alt=""></div>`;
    }
    return `
      <div class="browser">
        <div class="frame-bar" aria-hidden="true"><i></i><i></i><i></i><span>${esc(hostOf(app.links.web))}</span></div>
        <img src="${src}" width="1280" height="800" ${loading} alt="">
      </div>`;
  }

  function tourHTML(app) {
    let splitIndex = 0;
    return (app.tour || []).map((step) => {
      const copy = `<div class="step-copy"><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></div>`;
      const device = (i) => (step.device === 'mixed' ? (i === 0 ? 'desktop' : 'phone') : step.device);
      const shots = step.images.map((img, i) => shotHTML(app, img, device(i), true)).join('');
      const label = `aria-label="${esc(step.title)}"`;
      if (step.layout === 'wide') {
        return `<figure class="step step-wide reveal" ${label}>${copy}${shots}</figure>`;
      }
      if (step.layout === 'split') {
        const flip = splitIndex++ % 2 === 1;
        return `<figure class="step step-split${flip ? ' flip' : ''}${step.device === 'phone' ? ' is-phone' : ''} reveal" ${label}>${copy}<div class="step-media">${shots}</div></figure>`;
      }
      // phones und duo: mehrere Bilder nebeneinander, Text darüber
      return `<figure class="step step-${step.layout} n-${step.images.length} reveal" ${label}>${copy}<div class="step-media">${shots}</div></figure>`;
    }).join('');
  }

  function heroMediaHTML(app) {
    const h = app.hero || {};
    return `
      <div class="hero-media${h.phone ? ' has-phone' : ''}">
        ${shotHTML(app, h.desktop || null, 'desktop', false)}
        ${h.phone ? shotHTML(app, h.phone, 'phone', false) : ''}
      </div>`;
  }

  // Prompt für den empfohlenen Weg: mit meinem Code starten und anpassen
  function forkPrompt(app) {
    return `Ich habe die App „${app.title}“ auf GitHub geforkt. Das Original liegt hier: ${app.github}\n` +
      'Mein Fork: [hier die Adresse deines Forks einfügen]\n\n' +
      'Ich unterrichte und bin kein Programmierprofi. Hol dir bitte meinen Fork auf den Rechner und erklär mir kurz, wie die App aufgebaut ist. ' +
      'Dann hilf mir Schritt für Schritt, sie für meinen Unterricht anzupassen. Was anders sein soll, sage ich dir gleich.\n\n' +
      'Zum Schluss: Veröffentliche meine Version über GitHub Pages und sag mir die Adresse.';
  }

  function detailHTML(app, repos, prev, next) {
    const r = repos[app.id] || {};
    const stand = standOf(app, repos);
    const story = app.story || {};
    const privacy = app.privacy || { points: [], badges: [] };
    const audience = (app.audience || []).map((a) => AUDIENCE_LABEL[a]).filter(Boolean).join(' und ');
    const facts = [
      audience && ['Für', audience],
      r.created && ['Gestartet', formatDate(r.created, { month: 'long', year: 'numeric' })],
      stand && ['Stand', stand],
      r.commits && ['Änderungen', `${r.commits} Commits`],
    ].filter(Boolean);

    return `
      <section class="detail-hero container">
        <a class="back-link" href="/#apps">${icon('arrow-up-right', 'back-icon')}Alle Apps</a>
        <div class="detail-head">
          <div class="detail-copy">
            ${isWip(app) ? '<p class="detail-wip">in Arbeit</p>' : ''}
            <h1 class="detail-title">${esc(app.title)}</h1>
            <p class="detail-desc">${esc(app.description)}</p>
            <div class="detail-cta">
              <a class="btn btn-primary" href="${esc(app.links.web)}" target="_blank" rel="noopener">App öffnen ${icon('arrow-up-right')}</a>
              <a class="btn btn-secondary" href="#nachbauen">${icon('git-fork')}Nachbauen</a>
            </div>
            ${app.highlights ? `
            <ul class="hl-list">
              ${app.highlights.map(([ic, text]) => `<li>${icon(ic)}<span>${esc(text)}</span></li>`).join('')}
            </ul>` : ''}
          </div>
          ${heroMediaHTML(app)}
        </div>
        <dl class="facts">
          ${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}
        </dl>
      </section>

      ${app.tour ? `
      <section class="tour container" aria-labelledby="tour-title">
        <h2 class="section-title" id="tour-title">So sieht sie aus</h2>
        ${tourHTML(app)}
      </section>` : ''}

      ${story.problem ? `
      <section class="detail-section container" aria-labelledby="story-title">
        <h2 class="visually-hidden" id="story-title">Warum es die App gibt</h2>
        <figure class="story reveal">
          <p class="story-label" aria-hidden="true">Warum?</p>
          <blockquote class="story-text">${esc(story.problem)}</blockquote>
        </figure>
      </section>` : ''}

      <section class="detail-section container" aria-labelledby="privacy-title">
        <h2 class="section-title" id="privacy-title">Datenschutz</h2>
        <ul class="badges">
          ${(privacy.badges || []).map(([ic, text]) => `<li>${icon(ic)}<span>${esc(text)}</span></li>`).join('')}
        </ul>
        <ul class="checklist">
          ${privacy.points.map((p) => `<li>${icon('check')}<span>${esc(p)}</span></li>`).join('')}
        </ul>
      </section>

      <section class="detail-section container" id="nachbauen" aria-labelledby="remix-title">
        <h2 class="section-title" id="remix-title">Nachbauen</h2>
        <p class="remix-lead">Du musst nicht bei null anfangen. Kopier dir meinen Code, lass ihn von einem KI-Agenten für deinen Unterricht anpassen und veröffentliche deine eigene Version kostenlos auf GitHub Pages. Das nennt sich Vibecoding.</p>
        ${app.sourceNote ? `<p class="remix-note">${esc(app.sourceNote)}</p>` : ''}

        <ol class="route">
          <li>
            <span class="route-icon">${icon('git-fork')}</span>
            <h3>Kopie anlegen</h3>
            <p>Mit einem kostenlosen GitHub-Konto auf der Code-Seite oben rechts auf „Fork“ klicken. Die Kopie gehört dann dir.</p>
            <a class="btn btn-primary" href="${esc(app.github)}" target="_blank" rel="noopener">${icon('github-logo')}Code auf GitHub</a>
          </li>
          <li>
            <span class="route-icon">${icon('sparkle')}</span>
            <h3>Anpassen lassen</h3>
            <p>Dafür brauchst du einen Coding-Agenten wie <a href="https://code.claude.com/docs/de/desktop" target="_blank" rel="noopener">Claude Code</a> oder <a href="https://antigravity.google/" target="_blank" rel="noopener">Antigravity</a>. Ein normaler Chatbot kann keine Dateien bearbeiten. Gib dem Agenten diesen Prompt und sag ihm, was anders sein soll.</p>
            <div class="prompt">
              <p class="prompt-text" id="prompt-fork">${esc(forkPrompt(app))}</p>
              <button class="btn btn-secondary" type="button" data-copy="#prompt-fork">${icon('copy')}Prompt kopieren</button>
            </div>
          </li>
          <li>
            <span class="route-icon">${icon('arrow-up-right')}</span>
            <h3>Veröffentlichen</h3>
            <p>Das erledigt der Agent am Ende für dich. Du kannst es auch selbst machen: im eigenen Repository unter „Settings“ den Punkt „Pages“ öffnen und einschalten.</p>
          </li>
        </ol>

        ${story.prompt ? `
        <details class="more scratch">
          <summary>Lieber komplett neu bauen, ohne meinen Code?</summary>
          <p class="scratch-lead">Dann gib diesen Start-Prompt in Claude Code oder Antigravity ein. Die App ist in vielen Runden mit KI entstanden, nicht mit einem einzigen Prompt. Mit diesem Start-Prompt kommst du dem Ergebnis aber am nächsten.</p>
          <div class="prompt">
            <p class="prompt-text" id="prompt-scratch">${esc(story.prompt)}</p>
            <button class="btn btn-secondary" type="button" data-copy="#prompt-scratch">${icon('copy')}Prompt kopieren</button>
          </div>
        </details>` : ''}
      </section>

      <nav class="detail-more container" aria-label="Weitere Apps">
        <a class="more-link" href="/app.html?id=${encodeURIComponent(prev.id)}"><span>Vorherige App</span><strong>${esc(prev.title)}</strong></a>
        <a class="more-link more-next" href="/app.html?id=${encodeURIComponent(next.id)}"><span>Nächste App</span><strong>${esc(next.title)}</strong></a>
      </nav>`;
  }

  function initDetail() {
    const main = $('#detail');
    const id = new URLSearchParams(location.search).get('id');
    const notFound = () => {
      main.innerHTML = `
        <section class="container detail-missing">
          <h1 class="detail-title">Diese App gibt es nicht.</h1>
          <p class="detail-desc">Vielleicht ist der Link veraltet. Alle Apps findest du auf der Startseite.</p>
          <a class="btn btn-primary" href="/#apps">Zu den Apps</a>
        </section>`;
    };

    loadData()
      .then(({ apps, repos }) => {
        const i = apps.findIndex((a) => a.id === id);
        if (i < 0) { notFound(); return; }
        const app = apps[i];
        const prev = apps[(i - 1 + apps.length) % apps.length];
        const next = apps[(i + 1) % apps.length];
        document.title = `${app.title} | Eric Winderlich`;
        const desc = document.querySelector('meta[name="description"]');
        if (desc) desc.setAttribute('content', app.description);
        main.innerHTML = detailHTML(app, repos, prev, next);
        main.setAttribute('aria-busy', 'false');
        observeReveal(main);
        main.querySelectorAll('[data-copy]').forEach((b) => {
          b.addEventListener('click', () => copyText($(b.dataset.copy).textContent.trim(), 'Prompt kopiert'));
        });
        if (location.hash) {
          const target = document.getElementById(location.hash.slice(1));
          if (target) target.scrollIntoView();
        }
      })
      .catch(() => {
        main.innerHTML = `
          <section class="container detail-missing">
            <h1 class="detail-title">Das hat nicht geklappt.</h1>
            <p class="detail-desc">Die App-Daten konnten nicht geladen werden. Prüf deine Verbindung und lade die Seite neu.</p>
            <a class="btn btn-primary" href="/#apps">Zur Startseite</a>
          </section>`;
      });
  }

  // ------------------------------------------------------------------------
  // 404: Der Hamster und seine Ausreden
  // ------------------------------------------------------------------------

  function init404() {
    const hamster = $('#hamster');
    const bubble = $('#excuse');
    const excuses = [
      'Der Hund hat die Seite gefressen.',
      'Ich hatte die Seite, ehrlich! Sie liegt noch zu Hause.',
      'Das WLAN war weg.',
      'Die Seite war krank. Entschuldigung kommt nach.',
      'Ich dachte, die Seite ist erst nächste Woche fällig.',
      'Mein Drucker hat die Seite nicht rausgerückt.',
      'Ich war beim Arzt. Also, beim Tierarzt.',
    ];
    let i = -1;
    let clicks = 0;

    hamster.addEventListener('click', () => {
      i = (i + 1) % excuses.length;
      clicks++;
      bubble.textContent = excuses[i];
      bubble.classList.remove('pop');
      void bubble.offsetWidth; // Animation neu starten
      bubble.classList.add('pop');
      // Je öfter man klickt, desto schneller rennt er
      const speed = Math.max(0.35, 1.4 - clicks * 0.15);
      hamster.style.setProperty('--run', speed + 's');
    });
  }

  // ------------------------------------------------------------------------
  // Überall: Navigation, Einblenden, Kontakt
  // ------------------------------------------------------------------------

  function initNavShadow() {
    const nav = $('#nav');
    if (!nav) return;
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;height:1px;width:1px';
    document.body.prepend(sentinel);
    new IntersectionObserver((e) => nav.classList.toggle('scrolled', !e[0].isIntersecting)).observe(sentinel);
  }

  let revealIO = null;
  function observeReveal(scope) {
    const els = (scope || document).querySelectorAll('.reveal:not(.in)');
    if (!revealIO) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    els.forEach((el) => revealIO.observe(el));
  }

  function initReveal() {
    if ('IntersectionObserver' in window) {
      revealIO = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            revealIO.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }
    observeReveal(document);
  }

  function initContact() {
    const mailCopy = $('#mail-copy');
    if (mailCopy) mailCopy.addEventListener('click', () => copyText('mail@ericwinderlich.de', 'E-Mail-Adresse kopiert'));
    const share = $('#share-btn');
    if (share) {
      share.addEventListener('click', () => {
        const data = { title: document.title, url: location.href };
        if (navigator.share) navigator.share(data).catch(() => { /* abgebrochen */ });
        else copyText(data.url, 'Link kopiert');
      });
    }
  }

  // ------------------------------------------------------------------------
  // Start
  // ------------------------------------------------------------------------

  initNavShadow();
  initReveal();
  initContact();
  if (page === 'home') initHome();
  if (page === 'app') initDetail();
  if (page === '404') init404();
  syncTheme();
})();
