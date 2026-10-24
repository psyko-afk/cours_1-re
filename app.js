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

  const FILES = ['methode', 'cia', 'intro', 'procedes', 'quiz',
    'histoire', 'geographie', 'frise', 'programme_histoire', 'programme_geographie',
    'complements_histoire', 'complements_geographie', 'capacites', 'methodes'];

  async function loadData() {
    const out = {};
    await Promise.all(FILES.map(async (f) => {
      const r = await fetch('data/' + f + '.json');
      if (!r.ok) throw new Error('Fichier introuvable : ' + f);
      out[f] = await r.json();
    }));

    // Charger l'index de pagination des poèmes à la place du fichier unique poeme.json
    const rIndex = await fetch('data/index.json');
    if (!rIndex.ok) throw new Error('Fichier introuvable : index.json');
    out.indexPoemes = await rIndex.json();

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
    const indexData = d.indexPoemes;
    const totalPages = indexData.pagination.total_pages;
    let currentPage = 1;

    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-poeme';

    const chargerEtAfficherPage = async (numPage) => {
      el.innerHTML = `<p class="intro">Chargement de la page ${numPage}...</p>`;
      try {
        const reponse = await fetch(`data/poemes/page_${numPage}.json`);
        if (!reponse.ok) throw new Error(`Impossible de charger la page ${numPage}`);
        const pageData = await reponse.json();
        rendreContenuPage(pageData, numPage);
      } catch (err) {
        el.innerHTML = `<p class="error">Erreur : ${esc(err.message)}</p>`;
      }
    };

    const rendreContenuPage = (pageData, numPage) => {
      const poemes = pageData.poemes || [];

      let htmlPoemes = '';
      poemes.forEach((p, pIdx) => {
        const strophes = p.strophes || [];
        const lignes = p.lignes || [];
        
        let htmlStrophes = '';
        strophes.forEach((s) => {
          htmlStrophes += `<div class="stanza"><p class="stanza-label">${esc(s.nom)} · ${esc(s.vers)}</p>`;
          lignes.filter((l) => l.strophe === s.id).forEach((l) => {
            htmlStrophes += `<button class="line" type="button" data-n="${l.n}" data-poeme="${pIdx}" aria-pressed="false">
              <span class="n">${l.n}</span><span class="t">${esc(l.texte)}</span><span class="r">${esc(l.rime)}</span></button>`;
          });
          htmlStrophes += '</div>';
        });

        htmlPoemes += `
          <div class="card poem-block" style="margin-bottom: 2rem;">
            <h2>« ${esc(p.titre)} » (${esc(p.date)})</h2>
            <p class="small">${esc(p.recueil)} - ${esc(p.auteur)}</p>
            <div class="poem">${htmlStrophes}</div>
          </div>
        `;
      });

      el.innerHTML = `
        <h2>Cahiers de Douai - Poèmes (Page ${numPage} sur ${totalPages})</h2>
        <div class="pagination-controls" style="margin: 1rem 0; display: flex; gap: 1rem;">
          <button class="btn" id="prev-page" ${numPage <= 1 ? 'disabled' : ''}>← Page précédente</button>
          <button class="btn" id="next-page" ${numPage >= totalPages ? 'disabled' : ''}>Page suivante →</button>
        </div>
        <div class="poeme-layout">
          <div style="flex: 1;">${htmlPoemes}</div>
        </div>
      `;

      const btnPrev = el.querySelector('#prev-page');
      const btnNext = el.querySelector('#next-page');

      if (btnPrev) {
        btnPrev.addEventListener('click', () => {
          if (currentPage > 1) {
            currentPage--;
            chargerEtAfficherPage(currentPage);
          }
        });
      }

      if (btnNext) {
        btnNext.addEventListener('click', () => {
          if (currentPage < totalPages) {
            currentPage++;
            chargerEtAfficherPage(currentPage);
          }
        });
      }
    };

    chargerEtAfficherPage(currentPage);
    return el;
  }

  function viewCia(d) {
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-cia';
    const c = d.cia || { axes: [], conclusion: { ouvertures: [] } };
    el.innerHTML = `
      <h2>CIA et axes</h2>
      <div class="formula">
        <h3>${esc(c.formule?.titre || 'Formule CIA')}</h3>
        <p><b>${esc(c.formule?.texte || '')}</b></p>
      </div>
      <div class="stack">
        ${(c.axes || []).map((a, ai) => `
          <article class="card axe">
            <p class="tag">Axe ${ai + 1}</p>
            <h3>${esc(a.titre)}</h3>
            <p class="idee">${esc(a.idee)}</p>
          </article>`).join('')}
      </div>`;
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
      <p class="intro">Remplis les cinq cases dans l'ordre.</p>`;
    return el;
  }

  function viewProcedes(d) {
    const pr = d.procedes;
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-procedes';
    el.innerHTML = `<h2>Les procédés à connaître</h2>`;
    return el;
  }

  function viewQuiz(d) {
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-quiz';
    el.innerHTML = `<h2>Quiz</h2>`;
    return el;
  }

  function viewFiche(d) {
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-fiche';
    el.innerHTML = `<h2>La fiche de synthèse</h2>`;
    return el;
  }

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
    subjects.forEach((s) => s.views.pop() && s.views.forEach((v) => {})); // safe
    
    // Simplification du montage des vues
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
