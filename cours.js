/* Cours : vues génériques construites à partir d'un fichier de programme (histoire, géographie) */
window.Cours = (() => {
  'use strict';

  const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const shuffle = (a) => {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  };
  const ALLOWED = new Set(['STRONG', 'EM', 'B', 'I', 'UL', 'LI', 'P']);

  function build(key, label, data, ctx, extra) {
    const { esc, $, $$, store, copyText } = ctx;

    /* Nettoyage du HTML du fichier : on garde seulement le gras, l'italique, les listes et les sauts de ligne */
    const walk = (node) => {
      let s = '';
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) s += esc(n.nodeValue);
        else if (n.nodeType === 1) {
          const t = n.tagName;
          if (t === 'BR') s += '<br>';
          else if (ALLOWED.has(t)) { const l = t.toLowerCase(); s += '<' + l + '>' + walk(n) + '</' + l + '>'; }
          else s += walk(n);
        }
      });
      return s;
    };
    const parse = (html) => new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html').body.firstChild;
    const clean = (html) => walk(parse(html));
    const text = (html) => parse(html).textContent.replace(/\s+/g, ' ').trim();

    /* Lexique : un bloc « <strong>Terme :</strong> définition » séparé par une ligne vide */
    const parseLexique = (html) => html.split(/<br\s*\/?>\s*<br\s*\/?>/i).map((chunk) => {
      const m = chunk.match(/^\s*<strong>([\s\S]*?)<\/strong>\s*([\s\S]*)$/i);
      if (!m) return null;
      return { term: text(m[1]).replace(/[\s ]*:[\s ]*$/, '').trim(), def: text(m[2]) };
    }).filter(Boolean);

    /* Index du programme */
    const themes = data.themes.map((t, ti) => ({
      ti, titre: t.titre, short: t.titre.split(':')[0].trim(),
      chapitres: t.chapitres.map((c, ci) => ({ ti, ci, key: ti + '.' + ci, titre: c.titre, objectif: c.objectif, sections: c.sections, complement: !!c.complement }))
    }));
    const chapters = themes.flatMap((t) => t.chapitres);
    const isLex = (s) => /^Lexique/i.test(s.titre);
    const terms = [], points = [], corpus = [];
    chapters.forEach((c) => c.sections.forEach((s) => {
      const th = themes[c.ti];
      if (isLex(s)) parseLexique(s.contenu).forEach((x) => terms.push({ ...x, ti: c.ti, theme: th.short }));
      (s.points_passage || []).forEach((p) => points.push({ ...p, ti: c.ti, theme: th.short, chapitre: c.titre, section: s.titre }));
      corpus.push({ c, s, plain: norm(s.titre + ' ' + text(s.contenu) + ' ' + (s.points_passage || []).map((p) => p.titre + ' ' + p.description).join(' ')), raw: text(s.contenu) });
    }));

    const prog = (extra && extra.programme) || null;
    ((extra && extra.lexComp) || []).forEach((x) => terms.push({ term: x.term, def: x.def, ti: x.theme, theme: themes[x.theme].short, complement: true }));
    if (prog) {
      prog.themes.forEach((th, ti) => {
        const all = (th.points || []).map((p) => ({ ...p, chapitre: 'Étude de cas du programme' }))
          .concat((th.chapitres || []).flatMap((c) => (c.points || []).map((p) => ({ ...p, chapitre: c.titre }))));
        all.filter((p) => p.etat === 'complement').forEach((p) => points.push({
          titre: p.titre, description: p.description, ti, theme: themes[ti].short, chapitre: p.chapitre, section: 'Complément du programme', complement: true
        }));
      });
    }

    const themeSelect = (id) => `<select class="sel" id="${id}" aria-label="Choisir un thème"><option value="all">Tous les thèmes</option>${themes.map((t) => `<option value="${t.ti}">${esc(t.titre)}</option>`).join('')}</select>`;
    const pickTheme = (v) => (v === 'all' ? null : +v);

    /* ---------- Cours ---------- */
    function viewCours() {
      const el = document.createElement('section');
      el.className = 'view';
      const seen = store.get('seen-' + key, {});
      let cur = store.get('cur-' + key, chapters[0].key);
      if (!chapters.some((c) => c.key === cur)) cur = chapters[0].key;
      el.innerHTML = `
        <h2>${esc(data.titre_matiere.replace(/ — Programme Interactif/, ''))} : le cours</h2>
        <p class="intro">${themes.length} thèmes, ${chapters.length} chapitres. Choisis un chapitre, lis-le, puis coche-le quand tu l'as étudié.</p>
        <div class="cours-layout">
          <aside class="cours-nav">
            <label class="small" for="s-${key}">Chercher dans le cours</label>
            <input class="search" id="s-${key}" type="search" placeholder="mot, date, personnage…" autocomplete="off">
            <div class="results" id="r-${key}" hidden></div>
            <div id="n-${key}"></div>
            <p class="small" id="p-${key}"></p>
          </aside>
          <article class="card cours-main" id="m-${key}" tabindex="-1"></article>
        </div>`;
      const nav = $('#n-' + key, el), main = $('#m-' + key, el), res = $('#r-' + key, el), inp = $('#s-' + key, el);

      const drawNav = () => {
        nav.innerHTML = themes.map((t) => `
          <details class="th" ${t.chapitres.some((c) => c.key === cur) ? 'open' : ''}>
            <summary>${esc(t.short)} <span class="small">${esc(t.titre.replace(/^[^:]*:\s*/, ''))}</span></summary>
            <ul>${t.chapitres.map((c) => `<li><button type="button" class="chap" data-k="${c.key}" ${c.key === cur ? 'aria-current="true"' : ''}>
              <span class="ck">${seen[c.key] ? '✓' : ''}</span>${esc(c.titre.replace(/^Chapitre\s+/i, 'Chap. '))}</button></li>`).join('')}</ul>
          </details>`).join('');
        const n = chapters.filter((c) => seen[c.key]).length;
        $('#p-' + key, el).textContent = n + ' chapitre' + (n > 1 ? 's' : '') + ' étudié' + (n > 1 ? 's' : '') + ' sur ' + chapters.length;
        $$('.chap', nav).forEach((b) => b.addEventListener('click', () => open(b.dataset.k, true)));
      };

      const drawChapter = () => {
        const c = chapters.find((x) => x.key === cur);
        const idx = chapters.indexOf(c);
        const th = themes[c.ti];
        let h = `<p class="tag">${esc(th.short)}${c.complement ? ' <span class="tag comp">Complément d\'après le programme officiel</span>' : ''}</p><h3 class="ch-title">${esc(c.titre)}</h3><p class="note">${esc(c.objectif)}</p>`;
        c.sections.forEach((s) => {
          h += `<section class="csec"><h4>${esc(s.titre)}</h4>`;
          if (isLex(s)) {
            h += '<dl class="lex">' + parseLexique(s.contenu).map((x) => `<dt>${esc(x.term)}</dt><dd>${esc(x.def)}</dd>`).join('') + '</dl>';
          } else {
            h += '<div class="rich">' + clean(s.contenu) + '</div>';
          }
          (s.points_passage || []).forEach((p) => {
            h += `<aside class="pp"><span class="tag">Point de passage</span><h5>${esc(p.titre)}</h5><p>${esc(p.description)}</p></aside>`;
          });
          h += '</section>';
        });
        const pc = prog ? (prog.themes[c.ti].chapitres || []).find((x) => x.cours === c.titre) : null;
        const pcp = pc ? (pc.points || []).filter((p) => p.etat === 'complement') : [];
        if (pcp.length) {
          h += '<section class="csec"><h4>Points de passage du programme</h4>' + pcp.map((p) => `<aside class="pp"><span class="tag">Point de passage</span> <span class="tag comp">Complément</span><h5>${esc(p.titre)}</h5><p>${esc(p.description)}</p></aside>`).join('') + '</section>';
        }
        h += `<div class="chap-foot">
          <label class="check"><input type="checkbox" id="c-${key}" ${seen[c.key] ? 'checked' : ''}> J'ai étudié ce chapitre</label>
          <div class="pn">
            <button class="btn ghost" type="button" id="pv-${key}" ${idx === 0 ? 'disabled' : ''}>Précédent</button>
            <button class="btn" type="button" id="nx-${key}" ${idx === chapters.length - 1 ? 'disabled' : ''}>Suivant</button>
          </div></div>`;
        main.innerHTML = h;
        $('#c-' + key, main).addEventListener('change', (ev) => {
          seen[c.key] = ev.target.checked;
          store.set('seen-' + key, seen);
          drawNav();
        });
        $('#pv-' + key, main).addEventListener('click', () => open(chapters[idx - 1].key, true));
        $('#nx-' + key, main).addEventListener('click', () => open(chapters[idx + 1].key, true));
      };

      const open = (k, scroll) => {
        cur = k;
        store.set('cur-' + key, k);
        res.hidden = true; inp.value = '';
        nav.hidden = false;
        drawNav(); drawChapter();
        if (scroll) main.scrollIntoView({ block: 'start' });
      };

      inp.addEventListener('input', () => {
        const q = norm(inp.value.trim());
        if (q.length < 2) { res.hidden = true; nav.hidden = false; return; }
        const hits = corpus.filter((x) => x.plain.includes(q));
        nav.hidden = true; res.hidden = false;
        res.innerHTML = hits.length ? `<p class="small">${hits.length} résultat${hits.length > 1 ? 's' : ''}</p>` + hits.map((x, i) => {
          const at = norm(x.raw).indexOf(q);
          const snip = at >= 0 ? '…' + x.raw.slice(Math.max(0, at - 40), at + 80) + '…' : '';
          return `<button type="button" class="hit" data-i="${i}"><b>${esc(x.c.titre.replace(/^Chapitre\s+/i, 'Chap. '))}</b><br><span class="small">${esc(x.s.titre)}</span>${snip ? '<br><span class="small">' + esc(snip) + '</span>' : ''}</button>`;
        }).join('') : '<p class="small">Aucun résultat.</p>';
        $$('.hit', res).forEach((b) => b.addEventListener('click', () => open(hits[+b.dataset.i].c.key, true)));
      });

      document.addEventListener('atelier:open', (ev) => { if (ev.detail && ev.detail.subject === key) open(ev.detail.chap, false); });
      drawNav(); drawChapter();
      return el;
    }

    /* ---------- Lexique ---------- */
    function viewLexique() {
      const el = document.createElement('section');
      el.className = 'view';
      el.innerHTML = `
        <h2>Lexique</h2>
        <p class="intro">${terms.length} notions à connaître par cœur, avec leur définition.</p>
        <div class="filters">
          <input class="search" id="q-${key}" type="search" placeholder="Chercher une notion…" autocomplete="off" aria-label="Chercher une notion">
          ${themeSelect('t-' + key)}
        </div>
        <p class="small" id="c-${key}"></p>
        <div class="grid2" id="l-${key}"></div>`;
      const render = () => {
        const q = norm($('#q-' + key, el).value.trim());
        const t = pickTheme($('#t-' + key, el).value);
        const items = terms.filter((x) => (t === null || x.ti === t) && (!q || norm(x.term + ' ' + x.def).includes(q)));
        $('#c-' + key, el).textContent = items.length + ' notion' + (items.length > 1 ? 's' : '');
        $('#l-' + key, el).innerHTML = items.map((x) => `<article class="card proc"><span class="tag">${esc(x.theme)}</span>${x.complement ? ' <span class="tag comp">Complément</span>' : ''}<h3>${esc(x.term)}</h3><p>${esc(x.def)}</p></article>`).join('') || '<p class="small">Aucune notion ne correspond.</p>';
      };
      $('#q-' + key, el).addEventListener('input', render);
      $('#t-' + key, el).addEventListener('change', render);
      render();
      return el;
    }

    /* ---------- Points de passage ---------- */
    function viewPoints() {
      const el = document.createElement('section');
      el.className = 'view';
      el.innerHTML = `
        <h2>Points de passage et études de cas</h2>
        <p class="intro">${points.length} exemples précis à citer dans tes copies : date, acteur, lieu, et ce qu'ils montrent.</p>
        <div class="filters">
          <input class="search" id="q-${key}" type="search" placeholder="Chercher (Hugo, 1848, Shanghai…)" autocomplete="off" aria-label="Chercher un point de passage">
          ${themeSelect('t-' + key)}
        </div>
        <p class="small" id="c-${key}"></p>
        <div class="stack" id="l-${key}"></div>`;
      const render = () => {
        const q = norm($('#q-' + key, el).value.trim());
        const t = pickTheme($('#t-' + key, el).value);
        const items = points.filter((x) => (t === null || x.ti === t) && (!q || norm(x.titre + ' ' + x.description).includes(q)));
        $('#c-' + key, el).textContent = items.length + ' point' + (items.length > 1 ? 's' : '');
        $('#l-' + key, el).innerHTML = items.map((x) => `<article class="card pp-card"><span class="tag">${esc(x.theme)}</span>${x.complement ? ' <span class="tag comp">Complément</span>' : ''}<h3>${esc(x.titre)}</h3><p>${esc(x.description)}</p><p class="small">${esc(x.chapitre)} · ${esc(x.section)}</p></article>`).join('') || '<p class="small">Aucun résultat.</p>';
      };
      $('#q-' + key, el).addEventListener('input', render);
      $('#t-' + key, el).addEventListener('change', render);
      render();
      return el;
    }

    /* ---------- Révision (cartes) ---------- */
    function viewRevision() {
      const el = document.createElement('section');
      el.className = 'view';
      const hard = new Set(store.get('hard-' + key, []));
      const cards = {
        lexique: terms.map((x) => ({ id: 'L:' + x.term, front: x.term, back: x.def, tag: x.theme, ti: x.ti })),
        points: points.map((x) => ({ id: 'P:' + x.titre, front: x.titre, back: x.description, tag: x.theme, ti: x.ti }))
      };
      el.innerHTML = `
        <h2>Révision par cartes</h2>
        <p class="intro">Lis le recto, essaie de répondre de tête, retourne la carte, puis dis si tu savais. Les cartes ratées sont gardées dans « À revoir ».</p>
        <div class="card">
          <div class="filters">
            <select class="sel" id="d-${key}" aria-label="Choisir un paquet">
              <option value="lexique">Notions du lexique (${cards.lexique.length})</option>
              <option value="points">Points de passage (${cards.points.length})</option>
              <option value="hard">À revoir</option>
            </select>
            ${themeSelect('t-' + key)}
            <button class="btn" type="button" id="go-${key}">Commencer</button>
          </div>
          <div id="b-${key}" class="flash-box"></div>
        </div>`;
      const box = $('#b-' + key, el);
      let queue = [], i = 0, ok = 0, ko = [];
      const pool = () => {
        const d = $('#d-' + key, el).value;
        const t = pickTheme($('#t-' + key, el).value);
        let list = d === 'hard' ? cards.lexique.concat(cards.points).filter((c) => hard.has(c.id)) : cards[d];
        if (t !== null) list = list.filter((c) => c.ti === t);
        return list;
      };
      const start = (list) => {
        queue = shuffle(list); i = 0; ok = 0; ko = [];
        if (!queue.length) { box.innerHTML = '<p class="small">Aucune carte dans ce paquet.</p>'; return; }
        draw(false);
      };
      const draw = (flip) => {
        if (i >= queue.length) {
          box.innerHTML = `
            <p class="score">${ok} / ${queue.length}</p>
            <p>${ko.length ? ko.length + ' carte' + (ko.length > 1 ? 's' : '') + ' à revoir.' : 'Toutes les cartes sont sues.'}</p>
            <div class="btnrow2">
              ${ko.length ? `<button class="btn" type="button" id="re-${key}">Refaire les cartes ratées</button>` : ''}
              <button class="btn ghost" type="button" id="nw-${key}">Nouvelle série</button>
            </div>`;
          const re = $('#re-' + key, box);
          if (re) re.addEventListener('click', () => start(ko.slice()));
          $('#nw-' + key, box).addEventListener('click', () => start(pool()));
          return;
        }
        const c = queue[i];
        box.innerHTML = `
          <p class="count">Carte ${i + 1} sur ${queue.length} · <span class="tag">${esc(c.tag)}</span></p>
          <div class="flash ${flip ? 'back' : ''}">
            <p class="f-front">${esc(c.front)}</p>
            ${flip ? `<p class="f-back">${esc(c.back)}</p>` : ''}
          </div>
          <div class="btnrow2">
            ${flip ? `<button class="btn" type="button" id="y-${key}">Je savais</button><button class="btn ghost" type="button" id="n-${key}">À revoir</button>`
              : `<button class="btn" type="button" id="f-${key}">Retourner la carte</button>`}
          </div>`;
        if (!flip) { const f = $('#f-' + key, box); f.addEventListener('click', () => draw(true)); f.focus(); return; }
        $('#y-' + key, box).addEventListener('click', () => { ok++; hard.delete(c.id); save(); i++; draw(false); });
        $('#n-' + key, box).addEventListener('click', () => { ko.push(c); hard.add(c.id); save(); i++; draw(false); });
      };
      const save = () => store.set('hard-' + key, Array.from(hard));
      $('#go-' + key, el).addEventListener('click', () => start(pool()));
      box.innerHTML = `<p class="small">${hard.size ? hard.size + ' carte(s) à revoir en mémoire. ' : ''}Choisis un paquet puis clique sur « Commencer ».</p>`;
      return el;
    }

    /* ---------- Quiz ---------- */
    function viewQuiz() {
      const el = document.createElement('section');
      el.className = 'view';
      el.innerHTML = `
        <h2>Quiz sur le lexique</h2>
        <p class="intro">Dix questions tirées au hasard à partir des définitions du cours. Recommence autant de fois que tu veux : les questions changent.</p>
        <div class="card quiz">
          <div class="filters">${themeSelect('t-' + key)}<button class="btn" type="button" id="go-${key}">Lancer le quiz</button></div>
          <div id="b-${key}"></div>
        </div>`;
      const box = $('#b-' + key, el);
      const make = (t) => {
        const base = terms.filter((x) => t === null || x.ti === t);
        const chosen = shuffle(base).slice(0, 10);
        return chosen.map((x, n) => {
          const others = shuffle(base.filter((y) => y.term !== x.term)).slice(0, 3);
          const byDef = n % 2 === 0;
          const opts = shuffle([x].concat(others));
          return byDef
            ? { q: 'Quel terme correspond à cette définition ? « ' + x.def + ' »', opts: opts.map((o) => o.term), good: opts.indexOf(x), x }
            : { q: 'Que signifie « ' + x.term + ' » ?', opts: opts.map((o) => o.def), good: opts.indexOf(x), x };
        });
      };
      let qs = [], i = 0, score = 0;
      const render = () => {
        if (i >= qs.length) {
          box.innerHTML = `<p class="count">Terminé</p><p class="score">${score} / ${qs.length}</p>
            <p>${score >= qs.length * 0.8 ? 'Très bien : les notions sont solides.' : score >= qs.length * 0.5 ? 'Bon début : refais le quiz et revois les notions ratées dans les cartes.' : 'Relis le lexique, puis reviens.'}</p>
            <button class="btn" type="button" id="again-${key}">Nouveau quiz</button>`;
          $('#again-' + key, box).addEventListener('click', go);
          return;
        }
        const q = qs[i];
        box.innerHTML = `
          <p class="count">Question ${i + 1} sur ${qs.length}</p>
          <p class="q">${esc(q.q)}</p>
          <ul class="opts">${q.opts.map((o, k) => `<li><button class="opt" type="button" data-k="${k}">${esc(o)}</button></li>`).join('')}</ul>
          <div id="fb-${key}" aria-live="polite"></div>`;
        $$('.opt', box).forEach((b) => b.addEventListener('click', () => {
          const k = +b.dataset.k;
          $$('.opt', box).forEach((x) => { x.disabled = true; if (+x.dataset.k === q.good) x.classList.add('ok'); });
          if (k === q.good) score++; else b.classList.add('ko');
          $('#fb-' + key, box).innerHTML = `<p class="${k === q.good ? 'tip' : 'note'}"><b>${k === q.good ? 'Juste.' : 'Pas tout à fait.'}</b> ${esc(q.x.term)} : ${esc(q.x.def)}</p>
            <p><button class="btn" type="button" id="nx-${key}">${i + 1 < qs.length ? 'Question suivante' : 'Voir mon score'}</button></p>`;
          const nx = $('#nx-' + key, box);
          nx.addEventListener('click', () => { i++; render(); });
          nx.focus();
        }));
      };
      const go = () => { qs = make(pickTheme($('#t-' + key, el).value)); i = 0; score = 0; render(); };
      $('#go-' + key, el).addEventListener('click', go);
      box.innerHTML = '<p class="small">Choisis un thème (ou tous) puis lance le quiz.</p>';
      return el;
    }

    /* ---------- Frise (histoire) ---------- */
    function viewFrise() {
      const f = extra.frise;
      const el = document.createElement('section');
      el.className = 'view';
      el.innerHTML = `
        <h2>Frise chronologique</h2>
        <p class="intro">${f.evenements.length} repères dans l'ordre. ${esc(f.source)}</p>
        <div class="filters">
          <select class="sel" id="t-${key}" aria-label="Choisir un thème"><option value="all">Tous les thèmes</option>${f.themes.map((t, i) => `<option value="${i}">${esc(t)}</option>`).join('')}</select>
          <label class="check"><input type="checkbox" id="h-${key}"> Mode test : cacher les événements</label>
        </div>
        <ol class="frise" id="l-${key}"></ol>`;
      const render = () => {
        const t = pickTheme($('#t-' + key, el).value);
        const hide = $('#h-' + key, el).checked;
        $('#l-' + key, el).innerHTML = f.evenements.filter((e) => t === null || e.theme === t).map((e) => `
          <li class="ev th${e.theme}">
            <span class="dt">${esc(e.date)}</span>
            <div class="what ${hide ? 'veil' : ''}" ${hide ? 'tabindex="0" role="button" aria-label="Révéler l\'événement"' : ''}>
              <b>${esc(e.titre)}</b><br><span class="small">${esc(e.detail)}</span>
            </div>
            <span class="tag">${esc(f.themes[e.theme])}</span>
          </li>`).join('');
        $$('.veil', el).forEach((v) => {
          const reveal = () => v.classList.remove('veil');
          v.addEventListener('click', reveal);
          v.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); reveal(); } });
        });
      };
      $('#t-' + key, el).addEventListener('change', render);
      $('#h-' + key, el).addEventListener('change', render);
      render();
      return el;
    }

    /* ---------- Programme officiel ---------- */
    function viewProgramme() {
      const el = document.createElement('section');
      el.className = 'view';
      if (!prog) { el.innerHTML = '<h2>Programme officiel</h2><p class="small">Programme indisponible.</p>'; return el; }
      const byTitle = (t) => chapters.find((c) => c.titre === t);
      let nbCh = 0, inFile = 0, added = 0, missing = 0, ptFile = 0, ptComp = 0;
      const ptHtml = (p) => {
        if (p.etat === 'complement') ptComp++; else ptFile++;
        return `<li><b>${esc(p.titre)}</b> ${p.etat === 'complement' ? '<span class="tag comp">Complément</span>' : '<span class="tag ok">Dans ton fichier</span>'}${p.description ? `<details><summary class="small">Voir la fiche</summary><p>${esc(p.description)}</p></details>` : ''}</li>`;
      };
      const themesHtml = prog.themes.map((th, ti) => {
        const chs = (th.chapitres || []).map((ch) => {
          nbCh++;
          const c = ch.cours ? byTitle(ch.cours) : null;
          let badge;
          if (c && c.complement) { badge = '<span class="tag comp">Complété</span>'; added++; }
          else if (c) { badge = '<span class="tag ok">Dans ton cours</span>'; inFile++; }
          else { badge = '<span class="tag ko">Absent du cours</span>'; missing++; }
          return `<div class="prog-ch">
            <h4>${esc(ch.titre)}</h4>
            <p>${badge}${c ? ` <button class="btn ghost small-btn" type="button" data-k="${c.key}">Ouvrir le chapitre</button>` : ''}</p>
            ${ch.objectifs ? `<p class="small"><b>Objectifs :</b> ${esc(ch.objectifs)}</p>` : ''}
            ${ch.mettre_en_avant ? `<details><summary class="small">On peut mettre en avant</summary><ul class="bullets">${ch.mettre_en_avant.map((x) => '<li>' + esc(x) + '</li>').join('')}</ul></details>` : ''}
            ${(ch.points || []).length ? `<p class="label2">Points de passage et d'ouverture</p><ul class="bullets">${ch.points.map(ptHtml).join('')}</ul>` : ''}
          </div>`;
        }).join('');
        return `<article class="card prog-theme">
          <p class="tag">${esc(th.heures)}</p>
          <h3>${esc(th.titre)}</h3>
          ${th.commentaire ? `<details><summary class="small">Commentaire du programme</summary><ul class="bullets">${th.commentaire.map((x) => '<li>' + esc(x) + '</li>').join('')}</ul></details>` : ''}
          ${chs}
          ${(th.points || []).length ? `<p class="label2">Études de cas possibles</p><ul class="bullets">${th.points.map(ptHtml).join('')}</ul>` : ''}
        </article>`;
      }).join('');

      let notions = '';
      if (prog.notions) {
        const clean2 = (x) => norm(x).replace(/\([^)]*\)/g, ' ').replace(/\b(de|la|le|des|du|d)\b/g, ' ').replace(/[^a-z]+/g, ' ').trim();
        const split = (arr) => arr.flatMap((x) => x.term.split('/')).map(clean2);
        const orig = split(terms.filter((x) => !x.complement));
        const comp = split(terms.filter((x) => x.complement));
        notions = `<article class="card"><h3>Notions du programme et ton lexique</h3><p class="small">${esc(prog.notions_note || '')}</p><ul class="chips-list">${prog.notions.map((n) => {
          const k = clean2(n);
          const hit = (arr) => arr.includes(k);
          const st = hit(orig) ? '<span class="tag ok">Dans ton lexique</span>' : hit(comp) ? '<span class="tag comp">Complément</span>' : '<span class="tag ko">Manque</span>';
          return `<li><b>${esc(n)}</b> ${st}</li>`;
        }).join('')}</ul></article>`;
      }

      el.innerHTML = `
        <h2>Programme officiel</h2>
        <p class="intro"><b>${esc(prog.intitule)}</b> (${esc(prog.heures)}). ${esc(prog.source)}</p>
        <div class="stack">
          <article class="card">
            <h3>Présentation</h3>
            ${prog.presentation.map((x) => '<p>' + esc(x) + '</p>').join('')}
            <ul class="bullets">${prog.principes.map((x) => '<li>' + esc(x) + '</li>').join('')}</ul>
          </article>
          <article class="card" id="cov-${key}"></article>
          ${themesHtml}
          ${notions}
        </div>`;
      $('#cov-' + key, el).innerHTML = `<h3>Ce que couvre ton fichier</h3>
        <p>Sur ${nbCh} ${key === 'hi' ? 'chapitres' : 'questions'} du programme : <b>${inFile}</b> dans ton cours, <b>${added}</b> complété${added > 1 ? 's' : ''}, <b>${missing}</b> absent${missing > 1 ? 's' : ''}.</p>
        <p>Sur ${ptFile + ptComp} ${key === 'hi' ? 'points de passage' : 'études de cas'} officiels : <b>${ptFile}</b> dans ton fichier, <b>${ptComp}</b> complétés d'après le programme.</p>
        <p class="small">Les compléments sont rédigés d'après le programme officiel : à comparer avec ton cours.</p>`;
      $$('[data-k]', el).forEach((b) => b.addEventListener('click', () => {
        store.set('cur-' + key, b.dataset.k);
        document.dispatchEvent(new CustomEvent('atelier:open', { detail: { subject: key, chap: b.dataset.k } }));
        location.hash = '#' + key + '-cours';
      }));
      return el;
    }

    /* ---------- Méthodes et capacités ---------- */
    function viewMethodes() {
      const cap = extra.capacites, m = extra.methodes;
      const guides = key === 'hi' ? m.histoire : m.geographie;
      const fin = key === 'hi' ? cap.finalites_histoire : cap.finalites_geographie;
      const el = document.createElement('section');
      el.className = 'view';
      el.innerHTML = `
        <h2>Méthodes et capacités</h2>
        <p class="intro">${esc(cap.intro)}</p>
        <div class="stack">
          <article class="card"><h3>Finalités de l'enseignement</h3><ul class="bullets">${fin.map((x) => '<li>' + esc(x) + '</li>').join('')}</ul></article>
          <p class="small">${esc(m.note)}</p>
          ${guides.map((g) => `<article class="card"><h3>${esc(g.nom)}</h3><p>${esc(g.but)}</p>
            <ol class="steps">${g.etapes.map((e) => '<li>' + esc(e) + '</li>').join('')}</ol>
            <p class="note"><b>Pièges :</b> ${g.pieges.map(esc).join(' · ')}</p></article>`).join('')}
          ${cap.groupes.map((g) => `<article class="card"><h3>${esc(g.titre)}</h3>
            ${g.lignes.map((l) => `<p class="label2">${esc(l.nom)}</p><ul class="bullets">${l.items.map((x) => '<li>' + esc(x) + '</li>').join('')}</ul>`).join('')}</article>`).join('')}
        </div>`;
      return el;
    }

    const views = [
      { id: 'cours', label: 'Cours', render: viewCours },
      { id: 'programme', label: 'Programme', render: viewProgramme },
      { id: 'lexique', label: 'Lexique', render: viewLexique },
      { id: 'points', label: 'Points de passage', render: viewPoints }
    ];
    if (extra && extra.frise) views.push({ id: 'frise', label: 'Frise', render: viewFrise });
    views.push({ id: 'revision', label: 'Cartes', render: viewRevision }, { id: 'quiz', label: 'Quiz', render: viewQuiz });
    if (extra && extra.capacites && extra.methodes) views.push({ id: 'methodes', label: 'Méthodes', render: viewMethodes });
    return views;
  }

  return { build };
})();
