(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Mémoire locale : simple confort, la page marche sans */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('atelier:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('atelier:' + k, JSON.stringify(v)); } catch (e) { /* ignoré */ } }
  };

  const FILES = ['methode', 'poeme', 'cia', 'intro', 'procedes', 'quiz',
    'histoire', 'geographie', 'frise', 'programme_histoire', 'programme_geographie',
    'complements_histoire', 'complements_geographie', 'capacites', 'methodes'];
  async function loadData() {
    const out = {};
    await Promise.all(FILES.map(async (f) => {
      const r = await fetch('data/' + f + '.json');
      if (!r.ok) throw new Error('Fichier introuvable : ' + f);
      out[f] = await r.json();
    }));
    return out;
  }

  /* Compléments : titres de thèmes du programme officiel, chapitres manquants, renumérotation */
  function applyComplements(data, comp) {
    const d = JSON.parse(JSON.stringify(data));
    (comp.themes_titres || []).forEach((t, i) => { if (d.themes[i]) d.themes[i].titre = t; });
    (comp.renommer || []).forEach((r) => {
      const th = d.themes[r.theme];
      const c = th && th.chapitres.find((x) => x.titre === r.de);
      if (c) c.titre = r.vers;
    });
    (comp.chapitres || []).forEach((ch) => {
      const th = d.themes[ch.theme];
      const i = th.chapitres.findIndex((x) => x.titre === ch.apres);
      const copy = Object.assign({}, ch);
      delete copy.theme; delete copy.apres;
      th.chapitres.splice(i + 1, 0, copy);
    });
    return d;
  }

  /* Copie avec repli : si le presse-papiers est refusé, on affiche le texte sélectionné */
  async function copyText(text, btn) {
    const old = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copié';
      setTimeout(() => { btn.textContent = old; }, 1600);
    } catch (e) {
      let ta = btn.parentElement.querySelector('.fallback');
      if (!ta) {
        ta = document.createElement('textarea');
        ta.className = 'fallback';
        ta.readOnly = true;
        btn.parentElement.appendChild(ta);
      }
      ta.value = text;
      ta.focus();
      ta.select();
    }
  }

  /* ---------- Vues ---------- */

  function viewMethode(d) {
    const m = d.methode;
    const done = store.get('steps', {});
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-methode';
    el.innerHTML = `
      <h2>La méthode, étape par étape</h2>
      <p class="intro">${esc(m.definition)}</p>
      <div class="schema" aria-label="Plan d'un commentaire composé">
        ${m.schema.map((s, i) => (i ? '<span class="sep">→</span>' : '') + '<span>' + esc(s) + '</span>').join('')}
      </div>
      <p class="small" id="prog-label"></p>
      <div class="progress" aria-hidden="true"><i id="prog-bar"></i></div>
      <div class="stack" id="steps">
        ${m.etapes.map((e, i) => `
          <article class="card step ${done[i] ? 'done' : ''}" data-i="${i}">
            <div class="num" aria-hidden="true">${i + 1}</div>
            <div>
              <h3>${esc(e.titre)}</h3>
              <p class="meta">Temps conseillé : ${esc(e.duree)} · ${esc(e.resume)}</p>
              <ul>${e.actions.map((a) => '<li>' + esc(a) + '</li>').join('')}</ul>
              <p class="note"><b>Piège :</b> ${esc(e.piege)}</p>
              <p class="tip"><b>Avec « Le Mal » :</b> ${esc(e.exemple)}</p>
              <label class="check"><input type="checkbox" ${done[i] ? 'checked' : ''}> J'ai compris cette étape</label>
            </div>
          </article>`).join('')}
      </div>
      <div class="card" style="margin-top:1rem">
        <h3>Les erreurs qui font perdre des points</h3>
        <ul class="bullets">${m.erreurs.map((e) => '<li>' + esc(e) + '</li>').join('')}</ul>
      </div>`;
    const update = () => {
      const n = Object.values(done).filter(Boolean).length;
      $('#prog-label', el).textContent = n + ' étape' + (n > 1 ? 's' : '') + ' sur ' + m.etapes.length + ' comprise' + (n > 1 ? 's' : '');
      $('#prog-bar', el).style.width = (100 * n / m.etapes.length) + '%';
    };
    $$('.step', el).forEach((card) => {
      $('input', card).addEventListener('change', (ev) => {
        done[card.dataset.i] = ev.target.checked;
        card.classList.toggle('done', ev.target.checked);
        store.set('steps', done);
        update();
      });
    });
    update();
    return el;
  }

  function viewPoeme(d) {
    const p = d.poeme;
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-poeme';
    const stanzaOf = (id) => p.strophes.find((s) => s.id === id);
    let html = '';
    p.strophes.forEach((s) => {
      html += `<div class="stanza"><p class="stanza-label">${esc(s.nom)} · ${esc(s.vers)}</p>`;
      p.lignes.filter((l) => l.strophe === s.id).forEach((l) => {
        html += `<button class="line" type="button" data-n="${l.n}" aria-pressed="false">
          <span class="n">${l.n}</span><span class="t">${esc(l.texte)}</span><span class="r">${esc(l.rime)}</span></button>`;
      });
      html += '</div>';
    });
    el.innerHTML = `
      <h2>« ${esc(p.titre)} », ${esc(p.auteur)}</h2>
      <p class="intro">${esc(p.date)}, ${esc(p.recueil)}. Clique sur un vers pour voir le procédé et son effet. Les lettres à droite sont les rimes.</p>
      <div class="chips legend" id="legend" role="group" aria-label="Surligner un champ lexical">
        ${Object.entries(p.champs).map(([k, v]) => `<button class="chip" type="button" data-champ="${k}" aria-pressed="false">${esc(v.label)}</button>`).join('')}
        <button class="chip" type="button" id="rimes-btn" aria-pressed="true">Rimes</button>
      </div>
      <div class="poeme-layout">
        <div class="card poem" id="poem">${html}</div>
        <aside class="side" aria-live="polite">
          <div class="card" id="detail">
            <h3>Vers sélectionné</h3>
            <p class="small">Choisis un vers dans le poème pour afficher son analyse.</p>
          </div>
          <div class="card">
            <h3>Contexte</h3>
            <ul class="bullets">${p.contexte.map((c) => '<li>' + esc(c) + '</li>').join('')}</ul>
            <h3 style="margin-top:.8rem">Forme et structure</h3>
            <ul class="bullets">${p.forme.map((c) => '<li>' + esc(c) + '</li>').join('')}</ul>
          </div>
        </aside>
      </div>`;
    const active = new Set();
    const lines = $$('.line', el);
    const refresh = () => {
      lines.forEach((b) => {
        const l = p.lignes[+b.dataset.n - 1];
        b.classList.remove('hl-guerre', 'hl-nature', 'hl-religion', 'hl-peuple', 'dim');
        if (active.size) {
          const hit = l.champs.find((c) => active.has(c));
          if (hit) b.classList.add('hl-' + hit); else b.classList.add('dim');
        }
      });
    };
    $$('[data-champ]', el).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.champ;
      if (active.has(k)) active.delete(k); else active.add(k);
      b.setAttribute('aria-pressed', active.has(k));
      refresh();
    }));
    $('#rimes-btn', el).addEventListener('click', (ev) => {
      const b = ev.currentTarget;
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on);
      $('#poem', el).classList.toggle('rimes-off', !on);
    });
    const show = (n) => {
      const l = p.lignes[n - 1];
      lines.forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === n)));
      $('#detail', el).innerHTML = `
        <h3>Vers ${l.n} · ${esc(stanzaOf(l.strophe).nom)}</h3>
        <p class="quote">${esc(l.texte)}</p>
        <p class="label">Procédés</p><p>${esc(l.procede)}</p>
        <p class="label">Effet</p><p>${esc(l.effet)}</p>
        <p class="small">Rime : ${esc(l.rime)} · Champs : ${l.champs.map((c) => esc(p.champs[c].label)).join(', ')}</p>`;
    };
    lines.forEach((b) => b.addEventListener('click', () => show(+b.dataset.n)));
    show(1);
    return el;
  }

  function viewCia(d) {
    const c = d.cia;
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-cia';
    el.innerHTML = `
      <h2>CIA : de la citation aux axes</h2>
      <p class="intro">CIA veut dire Citation, Idée, Analyse. Pour chaque idée, tu cites le texte, tu nommes le procédé, puis tu expliques son effet. Les idées proches forment un axe.</p>
      <div class="formula">
        <h3>${esc(c.formule.titre)}</h3>
        <p><b>${esc(c.formule.texte)}</b></p>
        <p class="small">Exemple : ${esc(c.formule.exemple)}</p>
      </div>
      <div class="stack">
        ${c.axes.map((a, ai) => `
          <article class="card axe">
            <p class="tag">Axe ${ai + 1}</p>
            <h3>${esc(a.titre)}</h3>
            <p class="idee">${esc(a.idee)}</p>
            ${a.items.map((it) => `
              <div class="cia">
                <p class="where">${esc(it.vers)}</p>
                <p class="quote">« ${esc(it.citation)} »</p>
                <div class="btnrow">
                  <button class="btn ghost" type="button" data-show="p">Je cherche le procédé</button>
                  <button class="btn ghost" type="button" data-show="a" disabled>Voir l'analyse</button>
                </div>
                <div class="reveal">
                  <div class="box" data-box="p" hidden><b>Procédé</b>${esc(it.procede)}</div>
                  <div class="box" data-box="a" hidden><b>Analyse</b>${esc(it.analyse)}</div>
                </div>
              </div>`).join('')}
          </article>`).join('')}
      </div>
      <div class="card" style="margin-top:1rem">
        <h3>Progression et transitions</h3>
        <p>${esc(c.progression)}</p>
        <ul class="bullets">${c.transitions.map((t) => '<li>' + esc(t) + '</li>').join('')}</ul>
      </div>
      <div class="card" style="margin-top:1rem">
        <h3>Conclusion : bilan et ouverture</h3>
        <p>${esc(c.conclusion.bilan)}</p>
        <p class="small">Ouvertures possibles :</p>
        <ul class="bullets">${c.conclusion.ouvertures.map((t) => '<li>' + esc(t) + '</li>').join('')}</ul>
      </div>`;
    $$('.cia', el).forEach((blk) => {
      const [bp, ba] = $$('button', blk);
      bp.addEventListener('click', () => {
        $('[data-box="p"]', blk).hidden = false;
        bp.disabled = true;
        ba.disabled = false;
      });
      ba.addEventListener('click', () => {
        $('[data-box="a"]', blk).hidden = false;
        ba.disabled = true;
      });
    });
    return el;
  }

  function viewIntro(d) {
    const it = d.intro;
    const saved = store.get('intro', {});
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-intro';
    el.innerHTML = `
      <h2>Écrire l'introduction</h2>
      <p class="intro">Remplis les cinq cases dans l'ordre. En bas, ton introduction s'assemble. Tu peux afficher le modèle de chaque partie pour te comparer. Ce que tu écris est gardé dans ce navigateur.</p>
      <div class="stack">
        ${it.parties.map((p, i) => `
          <article class="card intro-part" data-k="${esc(p.cle)}">
            <p class="tag">${i + 1} sur ${it.parties.length}</p>
            <h3>${esc(p.titre)}</h3>
            <p>${esc(p.consigne)}</p>
            <div class="amorces" aria-label="Débuts de phrase possibles">${p.amorces.map((a) => '<span>' + esc(a) + '</span>').join('')}</div>
            <textarea id="ta-${esc(p.cle)}" aria-label="${esc(p.titre)}" placeholder="Écris ta partie ici…">${esc(saved[p.cle] || '')}</textarea>
            <div><button class="btn ghost" type="button" data-model>Voir le modèle</button></div>
            <div class="tip" data-modelbox hidden><b>Modèle :</b> ${esc(p.modele)}<br><span class="small"><b>À éviter :</b> ${esc(p.erreur)}</span></div>
          </article>`).join('')}
      </div>
      <div class="card" style="margin-top:1rem">
        <h3>Ton introduction</h3>
        <div class="assemble empty" id="assemble">Ton texte apparaît ici.</div>
        <p style="margin-top:.6rem"><button class="btn" type="button" id="copy-intro">Copier</button></p>
        <h3 style="margin-top:1rem">Vérifie</h3>
        <ul class="checklist">${it.checklist.map((c, i) => `<li><label><input type="checkbox" id="chk-${i}"> <span>${esc(c)}</span></label></li>`).join('')}</ul>
      </div>`;
    const asm = $('#assemble', el);
    const build = () => {
      const txt = it.parties.map((p) => ($('#ta-' + p.cle, el).value || '').trim()).filter(Boolean).join(' ');
      asm.textContent = txt || 'Ton texte apparaît ici.';
      asm.classList.toggle('empty', !txt);
      return txt;
    };
    $$('textarea', el).forEach((ta) => ta.addEventListener('input', () => {
      const obj = {};
      it.parties.forEach((p) => { obj[p.cle] = $('#ta-' + p.cle, el).value; });
      store.set('intro', obj);
      build();
    }));
    $$('[data-model]', el).forEach((b) => b.addEventListener('click', () => {
      const box = $('[data-modelbox]', b.closest('.card'));
      box.hidden = !box.hidden;
      b.textContent = box.hidden ? 'Voir le modèle' : 'Cacher le modèle';
    }));
    $('#copy-intro', el).addEventListener('click', (ev) => {
      const t = build();
      if (t) copyText(t, ev.currentTarget);
    });
    build();
    return el;
  }

  function viewProcedes(d) {
    const pr = d.procedes;
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-procedes';
    el.innerHTML = `
      <h2>Les procédés à connaître</h2>
      <p class="intro">Pour chaque procédé : une définition, un exemple et l'effet à dire dans ton analyse. Un procédé sans effet ne vaut rien.</p>
      <label for="q" class="small">Chercher un procédé</label><br>
      <input class="search" id="q" type="search" placeholder="métaphore, hyperbole, enjambement…" autocomplete="off">
      <div class="chips" id="cats" role="group" aria-label="Filtrer par catégorie">
        <button class="chip" type="button" data-cat="" aria-pressed="true">Tous</button>
        ${pr.categories.map((c) => `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}
      </div>
      <div class="grid2" id="plist"></div>`;
    let cat = '';
    const list = $('#plist', el);
    const render = () => {
      const q = $('#q', el).value.trim().toLowerCase();
      const items = pr.procedes.filter((p) => (!cat || p.cat === cat) &&
        (!q || (p.nom + ' ' + p.def + ' ' + p.ex + ' ' + p.effet).toLowerCase().includes(q)));
      list.innerHTML = items.length ? items.map((p) => `
        <article class="card proc">
          <span class="tag">${esc(p.cat)}</span>
          <h3>${esc(p.nom)}</h3>
          <dl>
            <dt>Définition</dt><dd>${esc(p.def)}</dd>
            <dt>Exemple</dt><dd>${esc(p.ex)}</dd>
            <dt>Effet</dt><dd>${esc(p.effet)}</dd>
          </dl>
        </article>`).join('') : '<p class="small">Aucun procédé ne correspond.</p>';
    };
    $('#q', el).addEventListener('input', render);
    $$('#cats .chip', el).forEach((b) => b.addEventListener('click', () => {
      cat = b.dataset.cat;
      $$('#cats .chip', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    }));
    render();
    return el;
  }

  function viewQuiz(d) {
    const qs = d.quiz.questions;
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-quiz';
    el.innerHTML = '<h2>Quiz</h2><p class="intro">Dix questions pour vérifier la méthode et « Le Mal ». Tu vois la correction après chaque réponse.</p><div class="card quiz" id="qbox"></div>';
    const box = $('#qbox', el);
    let i = 0, score = 0;
    const render = () => {
      if (i >= qs.length) {
        box.innerHTML = `
          <p class="count">Terminé</p>
          <p class="score">${score} / ${qs.length}</p>
          <p>${score >= 8 ? 'Très bien : la méthode est solide.' : score >= 5 ? 'Bon début : relis les étapes où tu as hésité.' : 'Reprends l\'onglet Méthode, puis recommence.'}</p>
          <button class="btn" type="button" id="again">Recommencer</button>`;
        $('#again', box).addEventListener('click', () => { i = 0; score = 0; render(); });
        return;
      }
      const q = qs[i];
      box.innerHTML = `
        <p class="count">Question ${i + 1} sur ${qs.length}</p>
        <p class="q">${esc(q.q)}</p>
        <ul class="opts">${q.options.map((o, k) => `<li><button class="opt" type="button" data-k="${k}">${esc(o)}</button></li>`).join('')}</ul>
        <div id="fb" aria-live="polite"></div>`;
      $$('.opt', box).forEach((b) => b.addEventListener('click', () => {
        const k = +b.dataset.k;
        $$('.opt', box).forEach((x) => {
          x.disabled = true;
          if (+x.dataset.k === q.bonne) x.classList.add('ok');
        });
        if (k === q.bonne) score++; else b.classList.add('ko');
        $('#fb', box).innerHTML = `<p class="${k === q.bonne ? 'tip' : 'note'}"><b>${k === q.bonne ? 'Juste.' : 'Pas tout à fait.'}</b> ${esc(q.explication)}</p>
          <p><button class="btn" type="button" id="next">${i + 1 < qs.length ? 'Question suivante' : 'Voir mon score'}</button></p>`;
        $('#next', box).addEventListener('click', () => { i++; render(); });
        $('#next', box).focus();
      }));
    };
    render();
    return el;
  }

  function viewFiche(d) {
    const p = d.poeme, c = d.cia, it = d.intro;
    const intro = it.parties.map((x) => x.modele).join(' ');
    const lines = [];
    lines.push('LE MAL (Rimbaud, octobre 1870) : fiche de synthèse');
    lines.push('');
    lines.push('CONTEXTE ET FORME');
    p.contexte.concat(p.forme).forEach((x) => lines.push('- ' + x));
    lines.push('');
    lines.push('AXES (CIA)');
    c.axes.forEach((a, i) => {
      lines.push('Axe ' + (i + 1) + ' : ' + a.titre);
      lines.push('  Idée : ' + a.idee);
      a.items.forEach((x) => lines.push('  - (' + x.vers + ') « ' + x.citation + ' » : ' + x.procede));
    });
    lines.push('');
    lines.push('INTRODUCTION');
    lines.push(intro);
    lines.push('');
    lines.push('OUVERTURES');
    c.conclusion.ouvertures.forEach((x) => lines.push('- ' + x));
    const text = lines.join('\n');
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-fiche';
    el.innerHTML = `
      <h2>La fiche de synthèse</h2>
      <p class="intro">Tout « Le Mal » sur une seule page, à relire avant le devoir.</p>
      <div class="grid2">
        <article class="card fiche">
          <h3>Contexte et forme</h3>
          <ul>${p.contexte.concat(p.forme).map((x) => '<li>' + esc(x) + '</li>').join('')}</ul>
          <h3>Introduction (modèle)</h3>
          <p>${esc(intro)}</p>
        </article>
        <article class="card fiche">
          <h3>Les trois axes</h3>
          ${c.axes.map((a, i) => `<p><b>Axe ${i + 1} : ${esc(a.titre)}</b><br><span class="small">${esc(a.idee)}</span></p>
            <ul>${a.items.map((x) => '<li>« ' + esc(x.citation) + ' » (' + esc(x.vers) + ') : ' + esc(x.procede) + '</li>').join('')}</ul>`).join('')}
          <h3>Ouvertures</h3>
          <ul>${c.conclusion.ouvertures.map((x) => '<li>' + esc(x) + '</li>').join('')}</ul>
        </article>
      </div>
      <p style="margin-top:1rem"><button class="btn" type="button" id="copy-fiche">Copier la fiche en texte</button></p>`;
    $('#copy-fiche', el).addEventListener('click', (ev) => copyText(text, ev.currentTarget));
    return el;
  }

  /* ---------- Navigation ---------- */

  const FR_VIEWS = [
    { id: 'methode', label: 'Méthode', render: viewMethode },
    { id: 'poeme', label: 'Le poème', render: viewPoeme },
    { id: 'cia', label: 'CIA et axes', render: viewCia },
    { id: 'intro', label: 'Introduction', render: viewIntro },
    { id: 'procedes', label: 'Procédés', render: viewProcedes },
    { id: 'quiz', label: 'Quiz', render: viewQuiz },
    { id: 'fiche', label: 'Fiche', render: viewFiche }
  ];

  function setTheme(mode) {
    if (mode) document.documentElement.setAttribute('data-theme', mode);
    else document.documentElement.removeAttribute('data-theme');
  }

  function initTheme() {
    const saved = store.get('theme', null);
    if (saved) setTheme(saved);
    $('#theme-btn').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') ||
        (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      setTheme(next);
      store.set('theme', next);
    });
  }

  function mount(d) {
    const ctx = { esc, $, $$, store, copyText };
    const histoire = applyComplements(d.histoire, d.complements_histoire);
    const geo = applyComplements(d.geographie, d.complements_geographie);
    const subjects = [
      { key: 'fr', label: 'Français', views: FR_VIEWS.map((v) => ({ id: v.id, label: v.label, render: () => v.render(d) })) },
      {
        key: 'hi', label: 'Histoire',
        views: Cours.build('hi', 'Histoire', histoire, ctx, {
          frise: d.frise, programme: d.programme_histoire, capacites: d.capacites, methodes: d.methodes
        })
      },
      {
        key: 'ge', label: 'Géographie',
        views: Cours.build('ge', 'Géographie', geo, ctx, {
          programme: d.programme_geographie, capacites: d.capacites, methodes: d.methodes, lexComp: d.complements_geographie.lexique
        })
      }
    ];
    const main = $('#main');
    main.innerHTML = '';
    const all = [];
    subjects.forEach((s) => s.views.forEach((v) => {
      const full = s.key + '-' + v.id;
      const box = document.createElement('div');
      box.id = 'v-' + full;
      box.hidden = true;
      main.appendChild(box);
      all.push({ full, subject: s, view: v, box, done: false });
    }));

    const subjNav = $('#subjects');
    subjNav.innerHTML = subjects.map((s) => `<a class="subj" href="#${s.key}-${s.views[0].id}" data-key="${s.key}">${esc(s.label)}</a>`).join('');
    const tabs = $('#tabs');
    const last = {};

    const go = () => {
      let h = location.hash.slice(1);
      if (!all.some((x) => x.full === h)) h = all.some((x) => x.full === 'fr-' + h) ? 'fr-' + h : 'fr-methode';
      const cur = all.find((x) => x.full === h);
      all.forEach((x) => { x.box.hidden = x !== cur; });
      if (!cur.done) {
        cur.done = true;
        const el = cur.view.render();
        el.hidden = false;
        cur.box.appendChild(el);
      }
      last[cur.subject.key] = cur.view.id;
      $$('.subj', subjNav).forEach((a) => {
        const k = a.dataset.key;
        a.href = '#' + k + '-' + (last[k] || subjects.find((s) => s.key === k).views[0].id);
        if (k === cur.subject.key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      tabs.innerHTML = cur.subject.views.map((v) => `<a class="tab" href="#${cur.subject.key}-${v.id}" ${v.id === cur.view.id ? 'aria-current="page"' : ''}>${esc(v.label)}</a>`).join('');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', go);
    go();
  }

  initTheme();
  loadData().then(mount).catch((e) => {
    $('#main').innerHTML = '<p class="error">Impossible de charger les fiches (' + esc(e.message) + '). Recharge la page.</p>';
  });
})();