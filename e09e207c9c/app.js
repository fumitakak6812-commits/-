/* =========================================================
   差は静止していない — 個人用 PWA
   保存は localStorage のみ。AI生成以外は完全オフラインで動く。
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'pl.data.v1';
  var APP_VERSION = 1;

  /* ---------------- utils ---------------- */
  var $ = function (s) { return document.querySelector(s); };
  var el = function (t, c) { var e = document.createElement(t); if (c) e.className = c; return e; };

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }
  function now() { return new Date().toISOString(); }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------------- store ---------------- */
  var data;

  function freshFromSeed() {
    var secs = window.SEED.sections.map(function (n) { return { id: uid(), name: n }; });
    var byName = {};
    secs.forEach(function (s) { byName[s.name] = s.id; });
    return {
      version: APP_VERSION,
      sections: secs,
      lines: window.SEED.lines.map(function (l) {
        return {
          id: uid(), body: l.body, note: l.note || '',
          sectionId: byName[l.section] || secs[0].id,
          createdAt: now(), updatedAt: now()
        };
      }),
      settings: { apiKey: '', model: 'claude-opus-5', effort: 'medium' }
    };
  }

  function normalize(d) {
    if (!d || typeof d !== 'object') throw new Error('形式が違います');
    if (!Array.isArray(d.sections) || !Array.isArray(d.lines)) throw new Error('形式が違います');
    var out = { version: APP_VERSION, sections: [], lines: [], settings: {} };
    var ids = {};
    d.sections.forEach(function (s) {
      if (!s || !s.name) return;
      var id = s.id || uid();
      if (ids[id]) id = uid();
      ids[id] = 1;
      out.sections.push({ id: id, name: String(s.name).slice(0, 40) });
    });
    if (!out.sections.length) out.sections.push({ id: uid(), name: '未分類' });
    d.lines.forEach(function (l) {
      if (!l || !l.body) return;
      out.lines.push({
        id: l.id || uid(),
        body: String(l.body),
        note: String(l.note || ''),
        sectionId: ids[l.sectionId] ? l.sectionId : out.sections[0].id,
        createdAt: l.createdAt || now(),
        updatedAt: l.updatedAt || now()
      });
    });
    var s = d.settings || {};
    out.settings = {
      apiKey: typeof s.apiKey === 'string' ? s.apiKey : '',
      model: s.model || 'claude-opus-5',
      effort: s.effort || 'medium'
    };
    return out;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    if (!raw) { data = freshFromSeed(); save(); return; }
    try { data = normalize(JSON.parse(raw)); }
    catch (e) { data = freshFromSeed(); }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { toast('保存できなかった（保存領域の上限かも）'); }
  }

  function sectionName(id) {
    for (var i = 0; i < data.sections.length; i++) if (data.sections[i].id === id) return data.sections[i].name;
    return '';
  }
  function linesOf(id) {
    return data.lines.filter(function (l) { return l.sectionId === id; });
  }

  /* ---------------- layer / history ---------------- */
  var layers = [];
  function pushLayer(closeFn) {
    layers.push(closeFn);
    try { history.pushState({ pl: layers.length }, ''); } catch (e) {}
  }
  function popLayer() {
    if (!layers.length) return;
    try { history.back(); } catch (e) { var f = layers.pop(); if (f) f(); }
  }
  window.addEventListener('popstate', function () {
    var f = layers.pop();
    if (f) f();
  });

  /* ---------------- render list ---------------- */
  function render() {
    var list = $('#list');
    list.textContent = '';
    var total = 0;

    data.sections.forEach(function (sec) {
      var items = linesOf(sec.id);
      total += items.length;
      if (!items.length) return;

      var s = el('section', 'sec');
      var h = el('div', 'sec-h');
      var h2 = el('h2'); h2.textContent = sec.name;
      var n = el('span', 'n'); n.textContent = items.length;
      h.appendChild(h2); h.appendChild(n);
      s.appendChild(h);

      items.forEach(function (l) {
        var b = el('button', 'line');
        b.type = 'button';
        var bd = el('b'); bd.textContent = l.body;
        b.appendChild(bd);
        if (l.note) { var nt = el('i'); nt.textContent = l.note; b.appendChild(nt); }
        b.addEventListener('click', function () { openEditor(l.id); });
        s.appendChild(b);
      });
      list.appendChild(s);
    });

    $('#empty').hidden = total > 0;
    $('#stat').textContent = total + '本 / ' + data.sections.length + '節';
    $('#btn-draw').disabled = total === 0;
  }

  /* ---------------- draw ---------------- */
  var lastDrawnId = null;

  function draw() {
    var pool = data.lines;
    if (!pool.length) { toast('まだ一本もない'); return; }
    var pick;
    if (pool.length === 1) pick = pool[0];
    else {
      var tries = 0;
      do { pick = pool[Math.floor(Math.random() * pool.length)]; tries++; }
      while (pick.id === lastDrawnId && tries < 40);
    }
    lastDrawnId = pick.id;
    $('#draw-sec').textContent = sectionName(pick.sectionId);
    $('#draw-body').textContent = pick.body;
    var n = $('#draw-note');
    n.textContent = pick.note || '';
    n.hidden = !pick.note;
    if ($('#draw').hidden) {
      $('#draw').hidden = false;
      pushLayer(function () { $('#draw').hidden = true; });
    }
  }

  /* ---------------- sheet ---------------- */
  var sheetOpen = false;

  function openSheet(title, buildBody, buildFoot) {
    $('#sheet-title').textContent = title;
    var body = $('#sheet-body'); body.textContent = '';
    var foot = $('#sheet-foot'); foot.textContent = '';
    buildBody(body);
    if (buildFoot) buildFoot(foot);
    body.scrollTop = 0;
    if (!sheetOpen) {
      sheetOpen = true;
      $('#scrim').hidden = false;
      $('#sheet').hidden = false;
      pushLayer(function () {
        sheetOpen = false;
        $('#scrim').hidden = true;
        $('#sheet').hidden = true;
        $('#sheet-body').textContent = '';
        $('#sheet-foot').textContent = '';
      });
    }
  }
  function closeSheet() { if (sheetOpen) popLayer(); }

  function field(labelText, node) {
    var l = el('label', 'f');
    var s = el('span'); s.textContent = labelText;
    l.appendChild(s); l.appendChild(node);
    return l;
  }
  function hint(text) { var p = el('p', 'hint'); p.textContent = text; return p; }

  function btn(cls, text, fn) {
    var b = el('button', cls); b.type = 'button'; b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  function row(k, label, desc, fn, warn) {
    var b = el('button', 'row' + (warn ? ' warn' : '')); b.type = 'button';
    var ks = el('span', 'k'); ks.textContent = k;
    var wrap = el('span');
    wrap.appendChild(document.createTextNode(label));
    if (desc) { var d = el('span', 'd'); d.textContent = desc; wrap.appendChild(d); }
    b.appendChild(ks); b.appendChild(wrap);
    b.addEventListener('click', fn);
    return b;
  }

  /* ---------------- line editor ---------------- */
  var NEW_SECTION = '__new__';

  function openEditor(id) {
    var line = null;
    if (id) {
      for (var i = 0; i < data.lines.length; i++) if (data.lines[i].id === id) line = data.lines[i];
      if (!line) return;
    }
    var bodyTa, noteTa, sel, newInput;

    openSheet(line ? '一言を編集' : '一言を追加', function (c) {
      bodyTa = el('textarea');
      bodyTa.rows = 3;
      bodyTa.placeholder = '刺さる短さで。1〜2文。';
      bodyTa.value = line ? line.body : '';
      c.appendChild(field('本文（パンチライン）', bodyTa));

      noteTa = el('textarea', 'note');
      noteTa.rows = 2;
      noteTa.placeholder = '理由や具体。1〜2文。';
      noteTa.value = line ? line.note : '';
      c.appendChild(field('補足', noteTa));

      sel = el('select');
      data.sections.forEach(function (s) {
        var o = el('option'); o.value = s.id; o.textContent = s.name; sel.appendChild(o);
      });
      var o2 = el('option'); o2.value = NEW_SECTION; o2.textContent = '＋ 新しい節をつくる';
      sel.appendChild(o2);
      sel.value = line ? line.sectionId : (data.sections[0] && data.sections[0].id);
      c.appendChild(field('節', sel));

      newInput = el('input');
      newInput.type = 'text';
      newInput.placeholder = '新しい節の名前';
      var newField = field('新しい節', newInput);
      newField.hidden = true;
      c.appendChild(newField);
      sel.addEventListener('change', function () {
        newField.hidden = sel.value !== NEW_SECTION;
        if (!newField.hidden) newInput.focus();
      });

      if (line) {
        c.appendChild(btn('btn-danger', 'この一言を削除', function () {
          if (!confirm('削除する？\n\n' + line.body)) return;
          data.lines = data.lines.filter(function (l) { return l.id !== line.id; });
          save(); render(); closeSheet(); toast('削除した');
        }));
        var sp = el('div'); sp.style.height = '.6rem'; c.appendChild(sp);
      }
    }, function (f) {
      f.appendChild(btn('btn-ghost', 'キャンセル', closeSheet));
      f.appendChild(btn('btn-primary', '保存', function () {
        var body = bodyTa.value.trim();
        if (!body) { toast('本文を入れる'); bodyTa.focus(); return; }

        var secId = sel.value;
        if (secId === NEW_SECTION) {
          var nm = newInput.value.trim();
          if (!nm) { toast('節の名前を入れる'); newInput.focus(); return; }
          var found = data.sections.filter(function (s) { return s.name === nm; })[0];
          if (found) secId = found.id;
          else { var ns = { id: uid(), name: nm }; data.sections.push(ns); secId = ns.id; }
        }

        if (line) {
          line.body = body; line.note = noteTa.value.trim();
          line.sectionId = secId; line.updatedAt = now();
        } else {
          data.lines.push({
            id: uid(), body: body, note: noteTa.value.trim(),
            sectionId: secId, createdAt: now(), updatedAt: now()
          });
        }
        save(); render(); closeSheet();
        toast(line ? '更新した' : '追加した');
      }));
    });

    if (!line) setTimeout(function () { bodyTa.focus(); }, 120);
  }

  /* ---------------- section manager ---------------- */
  function openSections() {
    openSheet('節の管理', function (c) {
      data.sections.forEach(function (s, idx) {
        var r = el('div', 'sitem');

        var up = btn('up', '↑', function () {
          if (idx === 0) return;
          var t = data.sections[idx - 1];
          data.sections[idx - 1] = s; data.sections[idx] = t;
          save(); render(); openSections();
        });
        var dn = btn('dn', '↓', function () {
          if (idx === data.sections.length - 1) return;
          var t = data.sections[idx + 1];
          data.sections[idx + 1] = s; data.sections[idx] = t;
          save(); render(); openSections();
        });
        up.disabled = idx === 0;
        dn.disabled = idx === data.sections.length - 1;

        var inp = el('input');
        inp.type = 'text'; inp.value = s.name;
        inp.addEventListener('change', function () {
          var v = inp.value.trim();
          if (!v) { inp.value = s.name; return; }
          s.name = v; save(); render();
        });

        var n = el('span', 'n'); n.textContent = linesOf(s.id).length + '本';

        var del = btn('', '×', function () {
          var cnt = linesOf(s.id).length;
          if (data.sections.length === 1) { toast('最後の節は消せない'); return; }
          var msg = cnt
            ? '「' + s.name + '」を削除する。\n中の ' + cnt + '本 も一緒に消える。'
            : '「' + s.name + '」を削除する。';
          if (!confirm(msg)) return;
          data.lines = data.lines.filter(function (l) { return l.sectionId !== s.id; });
          data.sections = data.sections.filter(function (x) { return x.id !== s.id; });
          save(); render(); openSections(); toast('削除した');
        });

        r.appendChild(up); r.appendChild(dn);
        r.appendChild(inp); r.appendChild(n); r.appendChild(del);
        c.appendChild(r);
      });

      c.appendChild(hint('名前は直接書き換えれば保存される。× は中の一言ごと消える。'));
    }, function (f) {
      f.appendChild(btn('btn-ghost', '閉じる', closeSheet));
      f.appendChild(btn('btn-primary', '＋ 節を追加', function () {
        var nm = prompt('新しい節の名前');
        if (!nm) return;
        nm = nm.trim();
        if (!nm) return;
        data.sections.push({ id: uid(), name: nm.slice(0, 40) });
        save(); render(); openSections();
      }));
    });
  }

  /* ---------------- AI ---------------- */
  var SYSTEM_BASE =
    'あなたは、30歳の男性コンサルタントのために、\n' +
    'モチベーションを喚起する短い一言を作る役割です。\n' +
    '\n' +
    '対象人物の背景：\n' +
    '- コンサルティングファーム勤務、転職して間もない。年収800万\n' +
    '- 33歳で1,100万を目指しているが、日々やる気が出ない\n' +
    '- 小学生の頃から朝が苦手。「気分じゃない」で休んでしまう癖がある\n' +
    '- 過去にベースと受験では没頭できた。共通点は「上達が可視化されていたこと」\n' +
    '- 現在の仕事は「余裕がある」状態で、そこに危機感を持っている\n' +
    '- 2歳上の兄は年収1,300万。同い年でマネージャーの同僚もいる\n' +
    '- 2027年1月に子どもが生まれ、7月まで育休の予定\n' +
    '\n' +
    '効くトーンと効かないトーン：\n' +
    '- 効く：具体的な他人との差、時間の経過、評価の固定化、\n' +
    '        機会損失の金額、「今この瞬間も差が開いている」という時制\n' +
    '- 効かない：一般的な自己啓発、精神論、「まずは小さな一歩から」系、\n' +
    '            優しい励まし、抽象的な人生訓\n' +
    '\n' +
    '出力形式：\n' +
    '- 本文（パンチライン）：1〜2文。刺さる短さ\n' +
    '- 補足：1〜2文。本文の理由や具体を添える\n' +
    '- 節：{{SECTIONS}} のいずれか\n' +
    '\n' +
    'JSON配列で4件出力してください。前置きや説明は不要です。\n' +
    '[{"body":"...","note":"...","section":"..."}]';

  function buildSystem() {
    return SYSTEM_BASE.replace('{{SECTIONS}}',
      data.sections.map(function (s) { return s.name; }).join(' / '));
  }

  function extractJsonArray(text) {
    var s = text.indexOf('[');
    var e = text.lastIndexOf(']');
    if (s < 0 || e <= s) throw new Error('JSONが見つからない');
    return JSON.parse(text.slice(s, e + 1));
  }

  function callClaude() {
    var key = (data.settings.apiKey || '').trim();
    if (!key) return Promise.reject(new Error('APIキーが未設定。メニュー → 設定 から入れる。'));
    if (!navigator.onLine) return Promise.reject(new Error('オフライン。AI生成だけはネットが要る。'));

    var existing = data.lines.slice(-40).map(function (l) { return '- ' + l.body; }).join('\n');
    var user =
      '新しい一言を4件つくってください。\n' +
      '今日の日付は ' + new Date().toLocaleDateString('ja-JP') + ' です。\n\n' +
      'すでに手元にあるもの（内容・言い回しが重ならないように）：\n' + existing;

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 180000);

    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: data.settings.model || 'claude-opus-5',
        max_tokens: 8000,
        output_config: { effort: data.settings.effort || 'medium' },
        system: buildSystem(),
        messages: [{ role: 'user', content: user }]
      })
    }).then(function (res) {
      return res.text().then(function (t) {
        var json = null;
        try { json = JSON.parse(t); } catch (e) {}
        if (!res.ok) {
          var m = (json && json.error && json.error.message) || ('HTTP ' + res.status);
          if (res.status === 401) m = 'APIキーが違うか無効。設定を見直す。';
          if (res.status === 429) m = 'レート制限。少し待ってからもう一度。';
          if (res.status === 400 && /credit|balance/i.test(m)) m = 'APIの残高不足かもしれない。';
          throw new Error(m);
        }
        if (json.stop_reason === 'refusal') throw new Error('生成が拒否された。もう一度試す。');
        var text = (json.content || [])
          .filter(function (b) { return b.type === 'text'; })
          .map(function (b) { return b.text; }).join('');
        var arr = extractJsonArray(text);
        if (!Array.isArray(arr) || !arr.length) throw new Error('候補が空だった');
        return arr.filter(function (o) { return o && o.body; }).map(function (o) {
          var sec = data.sections.filter(function (s) { return s.name === o.section; })[0];
          return {
            body: String(o.body).trim(),
            note: String(o.note || '').trim(),
            sectionId: sec ? sec.id : data.sections[0].id
          };
        });
      });
    }).catch(function (err) {
      if (err.name === 'AbortError') throw new Error('時間切れ。電波の良いところでもう一度。');
      if (err instanceof TypeError) throw new Error('通信に失敗した。ネットワークを確認する。');
      throw err;
    }).then(function (r) { clearTimeout(timer); return r; },
            function (e) { clearTimeout(timer); throw e; });
  }

  function openAI() {
    var state = { loading: false, error: '', cands: [], picked: {} };

    function paint() {
      openSheet('AIで追加', function (c) {
        if (state.error) { var e = el('p', 'err'); e.textContent = state.error; c.appendChild(e); }

        if (state.loading) {
          var s = el('div', 'spin');
          s.textContent = '生成中。30秒ほどかかる。';
          c.appendChild(s);
          return;
        }

        if (!state.cands.length) {
          c.appendChild(hint(
            'Claude に4件つくらせる。出てきたものを見て、採用するものだけ選んで保存する。' +
            '自動では保存しない。' + (data.settings.apiKey ? '' : '\n\nAPIキーが未設定。先に 設定 で入れる。')
          ));
          return;
        }

        state.cands.forEach(function (cd, i) {
          var b = el('button', 'cand');
          b.type = 'button';
          b.setAttribute('aria-pressed', state.picked[i] ? 'true' : 'false');
          var em = el('em'); em.textContent = sectionName(cd.sectionId);
          var bd = el('b'); bd.textContent = cd.body;
          var nt = el('i'); nt.textContent = cd.note;
          var mk = el('span', 'mark');
          b.appendChild(em); b.appendChild(bd); b.appendChild(nt); b.appendChild(mk);
          b.addEventListener('click', function () {
            state.picked[i] = !state.picked[i];
            b.setAttribute('aria-pressed', state.picked[i] ? 'true' : 'false');
            refreshFoot();
          });
          c.appendChild(b);
        });
        c.appendChild(hint('タップで採用／解除。'));
      }, buildFoot);
    }

    function countPicked() {
      return Object.keys(state.picked).filter(function (k) { return state.picked[k]; }).length;
    }

    function refreshFoot() { buildFoot($('#sheet-foot')); }

    function buildFoot(f) {
      f.textContent = '';
      if (state.loading) { f.appendChild(btn('btn-ghost', 'キャンセル', closeSheet)); return; }

      if (!state.cands.length) {
        f.appendChild(btn('btn-ghost', '閉じる', closeSheet));
        f.appendChild(btn('btn-primary', '生成する', run));
        return;
      }
      f.appendChild(btn('btn-ghost', 'もう一度生成', run));
      var n = countPicked();
      var sv = btn('btn-primary', n ? n + '件を保存' : '保存', function () {
        var added = 0;
        state.cands.forEach(function (cd, i) {
          if (!state.picked[i]) return;
          data.lines.push({
            id: uid(), body: cd.body, note: cd.note,
            sectionId: cd.sectionId, createdAt: now(), updatedAt: now()
          });
          added++;
        });
        if (!added) { toast('採用するものを選ぶ'); return; }
        save(); render(); closeSheet(); toast(added + '件を追加した');
      });
      sv.disabled = n === 0;
      f.appendChild(sv);
    }

    function run() {
      state.loading = true; state.error = ''; state.cands = []; state.picked = {};
      paint();
      callClaude().then(function (cands) {
        state.loading = false;
        state.cands = cands;
        paint();
      }).catch(function (err) {
        state.loading = false;
        state.error = err.message || String(err);
        paint();
      });
    }

    paint();
  }

  /* ---------------- settings ---------------- */
  function openSettings() {
    var keyInput, modelSel, effSel;
    openSheet('設定', function (c) {
      keyInput = el('input');
      keyInput.type = 'password';
      keyInput.autocomplete = 'off';
      keyInput.placeholder = 'sk-ant-...';
      keyInput.value = data.settings.apiKey || '';
      c.appendChild(field('Anthropic APIキー', keyInput));

      var show = el('label', 'f');
      var cb = el('input'); cb.type = 'checkbox';
      cb.style.width = 'auto'; cb.style.height = 'auto'; cb.style.marginRight = '.5rem';
      cb.addEventListener('change', function () { keyInput.type = cb.checked ? 'text' : 'password'; });
      var sp = el('span'); sp.style.display = 'inline'; sp.style.letterSpacing = '0';
      sp.style.fontSize = '.78rem'; sp.textContent = 'キーを表示';
      show.appendChild(cb); show.appendChild(sp);
      c.appendChild(show);

      c.appendChild(hint(
        'キーはこの端末のブラウザにだけ保存される。通信はブラウザから直接 Anthropic へ送られる（サーバーは経由しない）。' +
        'console.anthropic.com で発行する。'
      ));

      modelSel = el('select');
      [['claude-opus-5', 'Claude Opus 5（既定・いちばん効く）'],
       ['claude-sonnet-5', 'Claude Sonnet 5（速くて安い）'],
       ['claude-haiku-4-5', 'Claude Haiku 4.5（最速・最安）']].forEach(function (m) {
        var o = el('option'); o.value = m[0]; o.textContent = m[1]; modelSel.appendChild(o);
      });
      modelSel.value = data.settings.model || 'claude-opus-5';
      c.appendChild(field('モデル', modelSel));

      effSel = el('select');
      [['low', '低（速い）'], ['medium', '中（既定）'], ['high', '高（じっくり）']].forEach(function (m) {
        var o = el('option'); o.value = m[0]; o.textContent = m[1]; effSel.appendChild(o);
      });
      effSel.value = data.settings.effort || 'medium';
      c.appendChild(field('生成の深さ', effSel));
    }, function (f) {
      f.appendChild(btn('btn-ghost', 'キャンセル', closeSheet));
      f.appendChild(btn('btn-primary', '保存', function () {
        data.settings.apiKey = keyInput.value.trim();
        data.settings.model = modelSel.value;
        data.settings.effort = effSel.value;
        save(); closeSheet(); toast('設定を保存した');
      }));
    });
  }

  /* ---------------- export / import ---------------- */
  function exportJson() {
    var d = new Date();
    var stamp = d.getFullYear() +
      ('0' + (d.getMonth() + 1)).slice(-2) +
      ('0' + d.getDate()).slice(-2);
    var payload = {
      version: APP_VERSION,
      exportedAt: now(),
      sections: data.sections,
      lines: data.lines
      /* APIキーは書き出さない */
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a');
    a.href = url;
    a.download = 'pressurelines-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('書き出した');
  }

  var importMode = 'merge';
  function importJson(mode) {
    importMode = mode;
    $('#file').value = '';
    $('#file').click();
  }

  function handleFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var incoming;
      try { incoming = normalize(JSON.parse(String(r.result))); }
      catch (e) { toast('読み込めなかった：' + e.message); return; }

      if (importMode === 'replace') {
        var keep = data.settings;
        data = incoming;
        data.settings = keep;
        save(); render(); closeSheet();
        toast('置き換えた（' + data.lines.length + '本）');
        return;
      }

      // merge: 同じ本文はスキップ、節は名前で突き合わせ
      var byName = {};
      data.sections.forEach(function (s) { byName[s.name] = s.id; });
      var have = {};
      data.lines.forEach(function (l) { have[l.body] = 1; });

      var mapSec = {};
      incoming.sections.forEach(function (s) {
        if (byName[s.name]) { mapSec[s.id] = byName[s.name]; return; }
        var ns = { id: uid(), name: s.name };
        data.sections.push(ns);
        byName[s.name] = ns.id;
        mapSec[s.id] = ns.id;
      });

      var added = 0;
      incoming.lines.forEach(function (l) {
        if (have[l.body]) return;
        have[l.body] = 1;
        data.lines.push({
          id: uid(), body: l.body, note: l.note,
          sectionId: mapSec[l.sectionId] || data.sections[0].id,
          createdAt: l.createdAt, updatedAt: now()
        });
        added++;
      });
      save(); render(); closeSheet();
      toast(added + '本を追加した');
    };
    r.readAsText(file);
  }

  /* ---------------- menu ---------------- */
  function openMenu() {
    openSheet('メニュー', function (c) {
      c.appendChild(row('✦', 'AIで追加', 'Claude に4件つくらせて、選んで保存', openAI));
      c.appendChild(row('§', '節の管理', '追加・並べ替え・名前の変更・削除', openSections));
      c.appendChild(row('↓', 'JSONで書き出し', '機種変更のとき用', exportJson));
      c.appendChild(row('↑', 'JSONを読み込み（追加）', '今のデータに足す', function () { importJson('merge'); }));
      c.appendChild(row('⇄', 'JSONを読み込み（置き換え）', '今のデータを捨てて入れ替える', function () {
        if (confirm('今のデータを全部捨てて、ファイルの内容に置き換える。いい？')) importJson('replace');
      }, true));
      c.appendChild(row('⚙', '設定', 'APIキー・モデル', openSettings));
      c.appendChild(hint('保存先はこの端末のブラウザ。アプリを消すと消える。たまに書き出しておく。'));
    }, function (f) {
      f.appendChild(btn('btn-ghost', '閉じる', closeSheet));
    });
  }

  /* ---------------- wire up ---------------- */
  load();
  render();

  $('#btn-draw').addEventListener('click', draw);
  $('#btn-add').addEventListener('click', function () { openEditor(null); });
  $('#btn-menu').addEventListener('click', openMenu);
  $('#draw-again').addEventListener('click', draw);
  $('#draw-close').addEventListener('click', popLayer);
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#scrim').addEventListener('click', closeSheet);
  $('#file').addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && layers.length) popLayer();
  });

  /* ---------------- ホーム画面ショートカット ---------------- */
  try {
    var act = new URLSearchParams(location.search).get('a');
    if (act === 'draw') setTimeout(draw, 60);
    else if (act === 'add') setTimeout(function () { openEditor(null); }, 60);
    if (act) history.replaceState(null, '', location.pathname);
  } catch (e) { /* 古いブラウザ */ }

  /* ---------------- service worker ---------------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* file:// など */ });
    });
  }
})();
