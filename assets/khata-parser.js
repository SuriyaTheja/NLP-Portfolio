/* NLP-Khata — simplified in-browser re-implementation of the 10-stage pipeline.
   Illustrative only: the real system runs offline Whisper STT + a Python FastAPI pipeline. */
(function (root) {
  'use strict';

  // ---------- Stage 5 helper: Indic phonetic key (Soundex-like normalisation) ----------
  const clean = w => w.toLowerCase().replace(/[^a-z0-9.\u0900-\u0D7F]/gu, '');
  const phon = w => clean(w)
    .replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u')
    .replace(/th/g, 't').replace(/dh/g, 'd').replace(/w/g, 'v')
    .replace(/([a-z])\1+/g, '$1');

  // ---------- Lexicon ----------
  const LEX = new Map();
  const add = (lang, type, words, val) => words.split(' ').forEach(w => {
    const k = phon(w);
    if (!LEX.has(k)) LEX.set(k, { lang, type, val, canon: w });
  });
  const nums = (lang, obj) => Object.entries(obj).forEach(([w, v]) => {
    const mult = typeof v === 'string';
    add(lang, mult ? 'MULT' : 'NUM', w, mult ? Number(v) : v);
  });

  nums('TE', { okati: 1, okka: 1, rendu: 2, moodu: 3, naalugu: 4, aidhu: 5, aaru: 6, edu: 7, enimidi: 8, tommidi: 9, padi: 10, iravai: 20, vanda: '100', vandalu: '100', vela: '1000', veyyi: '1000', velu: '1000' });
  nums('HI', { ek: 1, teen: 3, chaar: 4, paanch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10, bees: 20, pachaas: 50, sau: '100', hazaar: '1000' });
  nums('HI', { do: 2 });
  nums('TA', { ondru: 1, onnu: 1, moonu: 3, naalu: 4, anju: 5, ainthu: 5, pathu: 10, nooru: '100', aayiram: '1000', ainooru: 500, irunooru: 200, munnooru: 300, irandairam: 2000, rendaayiram: 2000, moovaayiram: 3000 });
  nums('EN', { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: '100', thousand: '1000', lakh: '100000' });

  add('TE', 'POST_DAT', 'ki');
  add('TA', 'POST_DAT', 'ku');
  add('HI', 'POST_DAT', 'ko');
  add('EN', 'POST_DAT', 'to');
  add('TE', 'POST_ABL', 'nundi daggara');
  add('HI', 'POST_ABL', 'se');
  add('TA', 'POST_ABL', 'kitta irundhu');
  add('EN', 'POST_ABL', 'from');

  add('TE', 'V_PAYABLE', 'ivvali ivvalsindi');
  add('HI', 'V_PAYABLE', 'dena');
  add('TA', 'V_PAYABLE', 'kudukkanum');
  add('TE', 'V_RECEIVABLE', 'ravali raavalsindi');
  add('HI', 'V_RECEIVABLE', 'lena udhaar');
  add('TA', 'V_RECEIVABLE', 'varanum');
  add('TE', 'V_PAYIN', 'ichadu ichindi ichaaru kattadu');
  add('TA', 'V_PAYIN', 'koduthaar kuduthaar');
  add('HI', 'V_PAYIN', 'jama');
  add('TE', 'V_PAYOUT', 'ichanu kattanu');
  add('TA', 'V_PAYOUT', 'kuduthen');
  add('HI', 'V_GAVE', 'diya diye');
  add('EN', 'V_OWE', 'owe owes');
  add('EN', 'V_PAID', 'paid gave');
  add('EN', 'V_RECEIVED', 'received');

  add('TE', 'DATE', 'repu', 1); add('TE', 'DATE', 'ninna', -1); add('TE', 'DATE', 'ivala eroju', 0); add('TE', 'DATE', 'ellundi', 2);
  add('HI', 'DATE', 'kal', 1); add('HI', 'DATE', 'aaj', 0); add('HI', 'DATE', 'parson', 2);
  add('TA', 'DATE', 'naalai', 1); add('TA', 'DATE', 'indru', 0);
  add('EN', 'DATE', 'tomorrow', 1); add('EN', 'DATE', 'yesterday', -1); add('EN', 'DATE', 'today', 0);
  add('TE', 'NEXT', 'vache'); add('TA', 'NEXT', 'adutha'); add('HI', 'NEXT', 'agle'); add('EN', 'NEXT', 'next');
  add('TE', 'WEEK', 'vaaram'); add('HI', 'WEEK', 'hafte'); add('EN', 'WEEK', 'week');

  add('EN', 'METHOD', 'cash upi gpay phonepe paytm card online');
  add('TE', 'METHOD', 'nagadu');
  add('TE', 'HON', 'garu gaaru anna akka');
  add('HI', 'HON', 'ji bhai');
  add('EN', 'HON', 'sir madam');
  add('TE', 'PRON', 'vaadu aayana atanu ame');
  add('HI', 'PRON', 'usne woh');
  add('TA', 'PRON', 'avan avar');
  add('EN', 'PRON', 'he she him her they');
  add('EN', 'FIRST', 'i we');
  add('HI', 'FIRST', 'maine');
  add('EN', 'ME', 'me us');
  add('TE', 'Q', 'entha');
  add('HI', 'Q', 'kitna kitne');
  add('TA', 'Q', 'evvalavu');
  add('EN', 'Q', 'how');
  add('EN', 'CUR', 'rs rupees inr');
  add('TE', 'CUR', 'rupayalu');

  add('TE', 'W', 'lopala lo baki motham inka mariyu thedi ki ivvalani');
  add('HI', 'W', 'hai tak aur mujhe karna ne ka ki');
  add('TA', 'W', 'um sir kku');
  add('EN', 'W', 'and the by of for on via due balance advance payment credit much is has have my a pending within');
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  WEEKDAYS.forEach((d, i) => add('EN', 'WEEKDAY', d, i));

  const NAMES = ['Ramesh', 'Suresh', 'Mahesh', 'Venkat', 'Chandu', 'Pawan', 'Kumar', 'Raju', 'Kiran', 'Selvam', 'Murugan', 'Karthik', 'Kannan', 'Vijay', 'Raja', 'Rahul', 'Amit', 'Vikas', 'Rohit', 'Sathvik', 'Lakshmi', 'Priya'];
  const NAME_KEYS = NAMES.map(n => [phon(n), n]);

  const SPLIT_WORDS = new Set(['and', 'aur', 'mariyu', 'inka', 'also']);

  // ---------- Tokeniser ----------
  function tokenize(text) {
    const raw = text.replace(/₹\s?/g, 'rs ').replace(/[?!]/g, ' ? ').replace(/,(\s)/g, ' , ').replace(/-/g, ' ').split(/\s+/).filter(Boolean);
    return raw.map(surface => {
      const c = clean(surface);
      const t = { surface, clean: c, key: phon(surface), type: 'W', lang: null };
      if (surface === '?') { t.type = 'QMARK'; return t; }
      if (surface === ',') { t.type = 'COMMA'; return t; }
      if (/^\d[\d,]*(\.\d+)?k?$/i.test(surface.replace(/[.]$/, ''))) {
        const s = surface.toLowerCase().replace(/,/g, '').replace(/\.$/, '');
        t.type = 'NUM'; t.val = s.endsWith('k') ? parseFloat(s) * 1000 : parseFloat(s); t.lang = 'NUM';
        return t;
      }
      const hit = LEX.get(t.key);
      if (hit) { Object.assign(t, { type: hit.type, lang: hit.lang, val: hit.val, canon: hit.canon }); return t; }
      const nm = NAME_KEYS.find(([k]) => t.key === k || (t.key.startsWith(k) && t.key.length - k.length <= 3));
      if (nm) { t.type = 'NAME'; t.name = nm[1]; t.lang = 'NAME'; return t; }
      if (/^[A-Z][a-z]+$/.test(surface)) { t.type = 'NAME'; t.name = surface; t.lang = 'NAME'; t.unknownName = true; }
      return t;
    });
  }

  // ---------- Stage 1: spoken numeral parser ----------
  function parseAmount(tokens) {
    let best = null, i = 0;
    while (i < tokens.length) {
      if (tokens[i].type === 'NUM' || tokens[i].type === 'MULT') {
        const start = i; let total = 0, cur = 0;
        while (i < tokens.length && (tokens[i].type === 'NUM' || tokens[i].type === 'MULT')) {
          const t = tokens[i];
          if (t.type === 'MULT') {
            if (t.val >= 1000) { total += (cur || 1) * t.val; cur = 0; }
            else cur = (cur || 1) * t.val;
          } else cur += t.val;
          i++;
        }
        const value = total + cur;
        const span = tokens.slice(start, i);
        if (!best || value > best.value) best = { value, span, start, end: i };
      } else i++;
    }
    return best;
  }

  // ---------- Stage 6: temporal extractor ----------
  function parseDate(tokens, today) {
    const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'NEXT' && tokens[i + 1] && tokens[i + 1].type === 'WEEK') {
        return { span: [t, tokens[i + 1]], offset: 7, date: addDays(d0, 7) };
      }
      if (t.type === 'DATE') return { span: [t], offset: t.val, date: addDays(d0, t.val) };
      if (t.type === 'WEEKDAY') {
        let diff = (t.val - d0.getDay() + 7) % 7 || 7;
        return { span: [t], offset: diff, date: addDays(d0, diff) };
      }
    }
    return null;
  }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // ---------- Stage 9: directional classifier ----------
  function classify(tokens) {
    const has = type => tokens.find(t => t.type === type);
    const first = has('FIRST'), me = has('ME');
    const dat = has('POST_DAT'), abl = has('POST_ABL');
    let v;
    if ((v = has('V_PAYABLE'))) return { dir: 'PAYABLE', cues: [dat, v].filter(Boolean), why: `${dat ? dat.surface + ' … ' : ''}${v.surface} = “have to give”` };
    if ((v = has('V_RECEIVABLE'))) return { dir: 'RECEIVABLE', cues: [abl, v].filter(Boolean), why: `${abl ? abl.surface + ' … ' : ''}${v.surface} = “has to come to us”` };
    if ((v = has('V_PAYIN'))) return { dir: 'PAYMENT_IN', cues: [v], why: `${v.surface} = “they paid us”` };
    if ((v = has('V_PAYOUT'))) return { dir: 'PAYMENT_OUT', cues: [v], why: `${v.surface} = “I paid them”` };
    if ((v = has('V_GAVE'))) return first ? { dir: 'PAYMENT_OUT', cues: [first, v], why: `${first.surface} … ${v.surface} = “I gave”` } : { dir: 'PAYMENT_IN', cues: [v], why: `${v.surface} = “they gave us”` };
    if ((v = has('V_OWE'))) {
      if (first && tokens.indexOf(first) < tokens.indexOf(v)) return { dir: 'PAYABLE', cues: [first, v], why: `${first.surface} ${v.surface} = “we owe them”` };
      return { dir: 'RECEIVABLE', cues: [v, me].filter(Boolean), why: `${v.surface}${me ? ' ' + me.surface : ''} = “they owe us”` };
    }
    if ((v = has('V_PAID'))) {
      if (first && tokens.indexOf(first) < tokens.indexOf(v)) return { dir: 'PAYMENT_OUT', cues: [first, v], why: `${first.surface} ${v.surface} = “we paid them”` };
      return { dir: 'PAYMENT_IN', cues: [v], why: `${v.surface} = “they paid us”` };
    }
    if ((v = has('V_RECEIVED'))) return { dir: 'PAYMENT_IN', cues: [v], why: `${v.surface} = “money came in”` };
    return null;
  }

  // ---------- Stage 3: compound clause splitter ----------
  function splitClauses(tokens) {
    const parts = [[]];
    tokens.forEach(t => {
      if (t.type === 'COMMA' || SPLIT_WORDS.has(t.clean)) { parts.push([]); return; }
      parts[parts.length - 1].push(t);
    });
    const frags = parts.filter(p => p.length);
    const complete = p => p.some(t => t.type === 'NUM' || t.type === 'MULT') && p.some(t => /^V_/.test(t.type));
    const out = [];
    frags.forEach(p => {
      if (out.length && (!complete(p) || !complete(out[out.length - 1]))) out[out.length - 1] = out[out.length - 1].concat(p);
      else out.push(p);
    });
    return out.length ? out : [[]];
  }

  // ---------- Stage 4: language ID + Code-Mixing Index (Gambäck & Das, 2014) ----------
  function cmi(tokens) {
    const counts = { TE: 0, HI: 0, TA: 0, EN: 0 };
    let u = 0, n = 0;
    tokens.forEach(t => {
      if (t.type === 'QMARK' || t.type === 'COMMA') return;
      n++;
      if (counts[t.lang] !== undefined) counts[t.lang]++; else u++;
    });
    const max = Math.max(...Object.values(counts));
    const value = n - u > 0 ? 100 * (1 - max / (n - u)) : 0;
    return { counts, u, n, value };
  }

  // ---------- Full pipeline ----------
  function analyse(text, opts = {}) {
    const today = opts.today || new Date();
    const memory = opts.memory || {};
    const tokens = tokenize(text);
    const stages = {};
    const isQuery = tokens.some(t => t.type === 'Q' || t.type === 'QMARK');

    const mix = cmi(tokens);
    stages.lang = mix;
    stages.query = isQuery;

    const phonChanges = tokens.filter(t => t.canon && phon(t.canon) === t.key && clean(t.canon) !== t.clean).map(t => [t.surface, t.canon]);
    stages.phon = phonChanges;

    const clauses = splitClauses(tokens);
    stages.clauses = clauses;

    let lastActor = null; // within this utterance
    const events = clauses.map((cl, idx) => {
      const prevTurnActor = memory.lastActor || null;
      const amount = parseAmount(cl);
      const date = parseDate(cl, today);
      const dir = classify(cl);
      const methodTok = cl.find(t => t.type === 'METHOD');
      const nameTok = cl.find(t => t.type === 'NAME');
      const pron = cl.find(t => t.type === 'PRON');
      const hon = cl.filter(t => t.type === 'HON');
      let actor = nameTok ? nameTok.name : null, coref = null;
      if (!actor && lastActor) { actor = lastActor; coref = pron ? `${pron.surface} → ${lastActor}` : `omitted subject → ${lastActor} (previous clause)`; }
      else if (!actor && pron && prevTurnActor) { actor = prevTurnActor; coref = `${pron.surface} → ${prevTurnActor} (previous turn)`; }
      if (actor) lastActor = actor;
      const method = methodTok ? (methodTok.canon === 'nagadu' ? 'cash' : methodTok.canon) : null;
      const ev = {
        clause: idx + 1,
        text: cl.map(t => t.surface).join(' '),
        tokens: cl,
        amount, date, dir, actor, coref,
        actorSurface: nameTok ? nameTok.surface : (pron ? pron.surface : null),
        honorifics: hon.map(h => h.surface),
        unknownName: nameTok ? !!nameTok.unknownName : false,
        method,
        query: isQuery,
      };
      ev.status = isQuery ? 'QUERY' : (!amount ? 'REJECT_AMOUNT' : !dir ? 'REJECT_DIRECTION' : !actor ? 'REJECT_ACTOR' : 'OK');
      return ev;
    });

    return { text, tokens, stages, events, memory: { lastActor: lastActor || memory.lastActor || null } };
  }

  // ---------- Layer 4: double-entry posting ----------
  function postings(ev) {
    if (!ev || !ev.amount || !ev.dir || !ev.dir.dir) return null;
    const a = ev.amount.value, p = ev.actor, m = (ev.method || 'cash').toUpperCase();
    switch (ev.dir.dir) {
      case 'RECEIVABLE': return { lines: [['Dr', `Debtor · ${p}`, a], ['Cr', 'Credit Sales', a]], delta: +a };
      case 'PAYABLE': return { lines: [['Dr', 'Purchases', a], ['Cr', `Creditor · ${p}`, a]], delta: -a };
      case 'PAYMENT_IN': return { lines: [['Dr', m === 'UPI' ? 'Bank (UPI)' : 'Cash', a], ['Cr', `Debtor · ${p}`, a]], delta: -a };
      case 'PAYMENT_OUT': return { lines: [['Dr', `Creditor · ${p}`, a], ['Cr', m === 'UPI' ? 'Bank (UPI)' : 'Cash', a]], delta: +a };
    }
    return null;
  }

  const api = { analyse, postings, tokenize, parseAmount, phon, NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Khata = api;
})(typeof window !== 'undefined' ? window : globalThis);
