/* 五星麻雀 — 進行と画面 */
(function (global) {
  'use strict';
  var R = global.Rules, T = global.Tiles, AI = global.AI;
  var $ = function (id) { return document.getElementById(id); };
  var sleep = Fx.sleep;

  var SEAT_LABEL = ['東', '南', '西', '北', '星'];
  var NAMES = ['あなた', '楽師', '朧', '雷電', '星詠み'];
  var G = null;
  var pending = null;      // 人間の入力待ち
  var speed = 1;

  /* ================= 準備 ================= */
  function newGame() {
    G = {
      players: [], wall: [], dead: [], doraInd: [], uraInd: [],
      wildKind: -1, doraKinds: [], roundWind: R.WIND_FIRST,
      kyoku: 0, totalKyoku: 5, oya: 0, turn: 0,
      riichiSticks: 0, honba: 0, kanCount: 0,
      safeAfter: [[], [], [], [], []], over: false
    };
    for (var i = 0; i < 5; i++) {
      G.players.push({
        idx: i, name: NAMES[i], isHuman: i === 0, score: 25000,
        hand: [], drawn: null, melds: [], discards: [],
        riichi: false, riichiIdx: -1, ippatsu: false, menzen: true,
        seatWind: R.WIND_FIRST, furiten: false, tempFuriten: false, waits: []
      });
    }
    return G;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function setupHand() {
    var all = [];
    for (var i = 0; i < R.TILES; i++) all.push(i);
    shuffle(all);
    G.dead = all.splice(0, 14);
    G.wall = all;
    G.doraInd = [G.dead[0]];
    G.uraInd = [G.dead[5]];
    G.kanCount = 0;
    G.safeAfter = [[], [], [], [], []];
    G.doraKinds = [R.nextKind(G.doraInd[0] >> 2)];
    G.wildKind = G.doraKinds[0];          // ドラ＝変化牌
    G.oya = G.kyoku % 5;
    G.players.forEach(function (p, i) {
      p.hand = G.wall.splice(0, 13).sort(byKind);
      p.drawn = null; p.melds = []; p.discards = [];
      p.riichi = false; p.riichiIdx = -1; p.ippatsu = false; p.menzen = true;
      p.furiten = false; p.tempFuriten = false; p.waits = [];
      p.seatWind = R.WIND_FIRST + ((i - G.oya + 5) % 5);
    });
    G.turn = G.oya;
  }

  function byKind(a, b) { return (a >> 2) - (b >> 2) || a - b; }
  function all13(p) { return p.drawn != null ? p.hand.concat([p.drawn]) : p.hand.slice(); }
  function kindsOf(ts) { return ts.map(function (t) { return t >> 2; }); }

  /* ================= 描画 ================= */
  function tileOpts(tile, extra) {
    var o = extra || {};
    o.red = R.isRed(tile);
    var k = tile >> 2;
    if (k === G.wildKind) o.wild = true;
    else if (G.doraKinds.indexOf(k) >= 0) o.dora = true;
    return o;
  }
  function mkTile(tile, size, extra) {
    var o = tileOpts(tile, extra || {});
    o.size = size;
    return T.el(tile >> 2, o);
  }

  function renderHud() {
    $('hud-kyoku').textContent = '東' + (G.kyoku + 1) + '局' + (G.honba ? ' ' + G.honba + '本場' : '');
    $('hud-wall').textContent = '残 ' + G.wall.length;
    var KAN = ['一', '二', '三', '四', '五'];
    document.querySelector('.c-kyoku').textContent = '東' + KAN[G.kyoku] + '局';
    $('c-wall-n').textContent = G.wall.length;
    document.querySelector('.c-honba').textContent = G.honba ? G.honba + '本場' : '';
    var ring = $('wind-ring'), ANG = [180, 108, 36, 324, 252];
    if (ring.children.length !== 5) {
      ring.innerHTML = '';
      for (var wi = 0; wi < 5; wi++) {
        var e = document.createElement('div');
        e.className = 'wr'; e.style.setProperty('--a', ANG[wi] + 'deg');
        ring.appendChild(e);
      }
    }
    G.players.forEach(function (pp, pi) {
      var e = ring.children[pi];
      e.textContent = SEAT_LABEL[pp.seatWind - R.WIND_FIRST];
      e.className = 'wr' + (G.turn === pi ? ' on' : '') + (pp.riichi ? ' rc' : '');
    });
    $('hud-sticks').textContent = G.riichiSticks ? '供託 ' + (G.riichiSticks * 1000) : '';
    var d = $('hud-dora'); d.innerHTML = '';
    G.doraInd.forEach(function (t, i) { d.appendChild(mkTile(t, 'mini', {})); });
    for (var i = G.doraInd.length; i < 5; i++) { var b = document.createElement('div'); b.className = 'tile t-mini back'; d.appendChild(b); }
    var w = $('hud-wild'); w.innerHTML = '';
    if (G.wildKind >= 0) w.appendChild(T.el(G.wildKind, { size: 'mini', wild: true }));
  }

  function renderSeat(p) {
    var box = $('seat' + p.idx);
    box.innerHTML = '';
    box.className = 'seat pos' + p.idx + (G.turn === p.idx ? ' active' : '') + (p.riichi ? ' riichi' : '');

    var plate = document.createElement('div');
    plate.className = 'plate';
    plate.innerHTML = '<span class="wind w' + (p.seatWind - R.WIND_FIRST) + '">' + SEAT_LABEL[p.seatWind - R.WIND_FIRST] + '</span>' +
      '<span class="pname">' + p.name + '</span><span class="pscore">' + p.score + '</span>' +
      (p.riichi ? '<span class="rstick">立直</span>' : '');
    box.appendChild(plate);

    var hr = document.createElement('div');
    hr.className = 'ohand';
    for (var i = 0; i < p.hand.length; i++) { var b = document.createElement('div'); b.className = 'tile t-mini back'; hr.appendChild(b); }
    if (p.drawn != null) { var b2 = document.createElement('div'); b2.className = 'tile t-mini back drawn'; hr.appendChild(b2); }
    box.appendChild(hr);

    if (p.melds.length) box.appendChild(meldsEl(p, 'mini'));
    box.appendChild(pondEl(p));
  }

  function meldsEl(p, size) {
    var m = document.createElement('div');
    m.className = 'melds';
    p.melds.forEach(function (md) {
      var g = document.createElement('div');
      g.className = 'meld';
      md.tiles.forEach(function (t, i) {
        var hidden = md.type === 'ankan' && (i === 0 || i === 3);
        if (hidden) { var b = document.createElement('div'); b.className = 'tile t-' + size + ' back'; g.appendChild(b); }
        else g.appendChild(mkTile(t, size, { rotated: md.rotIdx === i }));
      });
      m.appendChild(g);
    });
    return m;
  }

  function pondEl(p) {
    var pond = document.createElement('div');
    pond.className = 'pond';
    p.discards.forEach(function (d, i) {
      var e = mkTile(d.tile, 'pond', { rotated: d.riichi });
      if (d.taken) e.classList.add('taken');
      if (i === p.discards.length - 1 && !d.taken) e.classList.add('latest');
      pond.appendChild(e);
    });
    return pond;
  }

  function renderMe() {
    var p = G.players[0];
    var mp = $('pond0'); mp.innerHTML = ''; mp.appendChild(pondEl(p));
    var mm = $('melds-me'); mm.innerHTML = '';
    if (p.melds.length) mm.appendChild(meldsEl(p, 'meld'));

    var h = $('hand'); h.innerHTML = '';
    p.hand.sort(byKind);
    p.hand.forEach(function (t, i) {
      var e = mkTile(t, 'hand', {});
      e.dataset.tile = t;
      h.appendChild(e);
    });
    if (p.drawn != null) {
      var sp = document.createElement('div'); sp.className = 'gap'; h.appendChild(sp);
      var e2 = mkTile(p.drawn, 'hand', {});
      e2.dataset.tile = p.drawn;
      e2.classList.add('tsumo-tile');
      h.appendChild(e2);
    }

    var plate = $('plate0');
    plate.innerHTML = '<span class="wind w' + (p.seatWind - R.WIND_FIRST) + '">' + SEAT_LABEL[p.seatWind - R.WIND_FIRST] + '</span>' +
      '<span class="pname">' + p.name + '</span><span class="pscore">' + p.score + '</span>' +
      (p.riichi ? '<span class="rstick">立直</span>' : '');
    $('me').classList.toggle('active', G.turn === 0);

    renderInfo();
  }

  function renderInfo() {
    var p = G.players[0];
    var info = $('info');
    var tiles = all13(p);
    var mc = p.melds.length;
    var sh = R.handShanten(kindsOf(tiles), G.wildKind, mc);
    if (tiles.length % 3 === 2) {
      // 14 枚: 何を切れば聴牌かは出さず、現状のみ
      var base = 99;
      for (var i = 0; i < tiles.length; i++) {
        var r = tiles.slice(); r.splice(i, 1);
        base = Math.min(base, R.handShanten(kindsOf(r), G.wildKind, mc));
      }
      sh = base;
    }
    var txt;
    if (sh <= 0) {
      var waits = currentWaits(p);
      txt = '<b class="tenpai">聴牌</b> 待ち: ' + (waits.length ? waits.map(R.kindName).join(' ') : '—');
      if (p.furiten || p.tempFuriten) txt += ' <b class="furiten">振聴</b>';
    } else {
      txt = '<b>' + sh + '</b> 向聴';
    }
    info.innerHTML = txt;
  }

  function currentWaits(p) {
    var tiles = all13(p), mc = p.melds.length;
    if (tiles.length % 3 === 2) {
      // 14 枚なら切ってからの待ちは出さない
      var set = {};
      for (var i = 0; i < tiles.length; i++) {
        var r = tiles.slice(); r.splice(i, 1);
        if (R.handShanten(kindsOf(r), G.wildKind, mc) === 0) {
          R.waitsOf(kindsOf(r), G.wildKind, mc).forEach(function (k) { set[k] = 1; });
        }
      }
      return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    }
    return R.waitsOf(kindsOf(tiles), G.wildKind, mc);
  }

  function render() {
    renderHud();
    for (var i = 1; i < 5; i++) renderSeat(G.players[i]);
    renderMe();
  }

  /* ================= 入力 ================= */
  function waitInput() { return new Promise(function (res) { pending = res; }); }
  function resolveInput(v) { if (pending) { var f = pending; pending = null; f(v); } }

  function setButtons(list) {
    var bar = $('actionbar');
    bar.innerHTML = '';
    list.forEach(function (b) {
      var e = document.createElement('button');
      e.className = 'act act-' + b.key;
      e.textContent = b.label;
      e.onclick = function () { Sfx.unlock(); setButtons([]); resolveInput(b.value); };
      bar.appendChild(e);
    });
    bar.classList.toggle('on', list.length > 0);
  }

  function setHandSelectable(on, allowed) {
    var h = $('hand');
    h.classList.toggle('selectable', !!on);
    Array.prototype.forEach.call(h.children, function (e) {
      if (!e.dataset.tile) return;
      var t = +e.dataset.tile;
      var ok = on && (!allowed || allowed.indexOf(t) >= 0);
      e.classList.toggle('pickable', ok);
      e.classList.toggle('locked', on && !ok);
      e.onclick = ok ? function () { Sfx.unlock(); setHandSelectable(false); setButtons([]); resolveInput({ type: 'discard', tile: t }); } : null;
    });
  }

  /* ================= 手番 ================= */
  function drawTile(p, fromDead) {
    var t;
    if (fromDead) { t = G.dead.pop(); if (G.wall.length) G.wall.pop(); }
    else t = G.wall.shift();
    p.drawn = t;
    return t;
  }

  function canTsumo(p) {
    var tiles = all13(p);
    if (!R.isAgari(kindsOf(tiles), G.wildKind, p.melds.length)) return null;
    return judgeFor(p, p.drawn, true, false);
  }

  function judgeFor(p, winTile, tsumo, chankan) {
    var tiles = p.drawn != null && tsumo ? all13(p) : p.hand.concat([winTile]);
    var hk = kindsOf(tiles);
    var dora = 0, red = 0, ura = 0;
    var counted = tiles.concat([]);
    p.melds.forEach(function (m) { counted = counted.concat(m.tiles); });
    counted.forEach(function (t) {
      var k = t >> 2;
      G.doraKinds.forEach(function (dk) { if (k === dk) dora++; });
      if (R.isRed(t)) red++;
    });
    if (p.riichi) {
      var uraKinds = G.uraInd.map(function (t) { return R.nextKind(t >> 2); });
      counted.forEach(function (t) { uraKinds.forEach(function (uk) { if ((t >> 2) === uk) ura++; }); });
    }
    return R.judge({
      handKinds: hk, melds: p.melds, winKind: winTile >> 2, wildKind: G.wildKind,
      tsumo: !!tsumo, riichi: p.riichi, doubleRiichi: false, ippatsu: p.ippatsu,
      menzen: p.menzen, seatWind: p.seatWind, roundWind: G.roundWind,
      rinshan: !!p.rinshan, haitei: tsumo && G.wall.length === 0, houtei: !tsumo && G.wall.length === 0,
      chankan: !!chankan, doraCount: dora, redCount: red, uraCount: ura
    });
  }

  function canRon(p, tile) {
    if (p.hand.length + p.melds.length * 3 !== 13) return null;
    var hk = kindsOf(p.hand.concat([tile]));
    if (!R.isAgari(hk, G.wildKind, p.melds.length)) return null;
    if (p.furiten || p.tempFuriten) return null;
    var waits = R.waitsOf(kindsOf(p.hand), G.wildKind, p.melds.length);
    for (var i = 0; i < p.discards.length; i++) {
      if (waits.indexOf(p.discards[i].tile >> 2) >= 0) { p.furiten = true; return null; }
    }
    return judgeFor(p, tile, false, false);
  }

  function ankanKinds(p) {
    var tiles = all13(p), c = {};
    tiles.forEach(function (t) { c[t >> 2] = (c[t >> 2] || 0) + 1; });
    return Object.keys(c).filter(function (k) { return c[k] >= 4; }).map(Number);
  }
  function kakanTiles(p) {
    var out = [];
    var tiles = all13(p);
    p.melds.forEach(function (m, mi) {
      if (m.type !== 'pon') return;
      var k = m.tiles[0] >> 2;
      tiles.forEach(function (t) { if ((t >> 2) === k) out.push({ meld: mi, tile: t }); });
    });
    return out;
  }

  function riichiDiscards(p) {
    var tiles = all13(p), mc = p.melds.length, ok = [];
    for (var i = 0; i < tiles.length; i++) {
      var r = tiles.slice(); r.splice(i, 1);
      if (R.handShanten(kindsOf(r), G.wildKind, mc) === 0) ok.push(tiles[i]);
    }
    return ok;
  }

  /* --- 人間の手番 --- */
  async function humanTurn(p) {
    render();
    while (true) {
      var btns = [];
      var win = canTsumo(p);
      if (win) btns.push({ key: 'tsumo', label: 'ツモ', value: { type: 'tsumo' } });
      var rd = p.riichi ? [] : (p.menzen ? riichiDiscards(p) : []);
      if (!p.riichi && p.menzen && rd.length && p.score >= 1000 && G.wall.length >= 4) {
        btns.push({ key: 'riichi', label: '立直', value: { type: 'riichi' } });
      }
      var ak = ankanKinds(p), kk = kakanTiles(p);
      if ((ak.length || kk.length) && G.wall.length > 0 && G.kanCount < 4) {
        btns.push({ key: 'kan', label: 'カン', value: { type: 'kan' } });
      }
      setButtons(btns);
      setHandSelectable(true, p.riichi ? [p.drawn] : null);
      var act = await waitInput();

      if (act.type === 'discard') return { discard: act.tile };
      if (act.type === 'tsumo') return { win: win, tsumo: true };
      if (act.type === 'riichi') {
        setButtons([{ key: 'cancel', label: 'やめる', value: { type: 'cancel' } }]);
        setHandSelectable(true, rd);
        $('info').innerHTML = '<b class="tenpai">立直宣言</b> 聴牌を保てる牌を選ぶ';
        var a2 = await waitInput();
        setHandSelectable(false);
        if (a2.type === 'discard') return { discard: a2.tile, riichi: true };
        continue;
      }
      if (act.type === 'kan') {
        var choices = [];
        ak.forEach(function (k) { choices.push({ key: 'k' + k, label: '暗槓 ' + R.kindName(k), value: { type: 'ankan', kind: k } }); });
        kk.forEach(function (o) { choices.push({ key: 'a' + o.tile, label: '加槓 ' + R.kindName(o.tile >> 2), value: { type: 'kakan', o: o } }); });
        choices.push({ key: 'cancel', label: 'やめる', value: { type: 'cancel' } });
        setButtons(choices);
        setHandSelectable(false);
        var a3 = await waitInput();
        if (a3.type === 'cancel') continue;
        return { kan: a3 };
      }
    }
  }

  /* --- AI の手番 --- */
  async function aiTurn(p) {
    render();
    await sleep(320 / speed);
    var win = canTsumo(p);
    if (win) return { win: win, tsumo: true };

    if (!p.riichi && G.kanCount < 4 && G.wall.length > 0) {
      var ak = ankanKinds(p);
      for (var i = 0; i < ak.length; i++) {
        if (AI.wantKan(G, p, ak[i])) return { kan: { type: 'ankan', kind: ak[i] } };
      }
      var kk = kakanTiles(p);
      if (kk.length && AI.wantKan(G, p, kk[0].tile >> 2)) return { kan: { type: 'kakan', o: kk[0] } };
    }

    if (p.riichi) return { discard: p.drawn };

    var rd = p.menzen ? riichiDiscards(p) : [];
    if (rd.length && AI.wantRiichi(G, p) && Math.random() < 0.9) {
      var pick = rd[0], bestScore = -1e9;
      rd.forEach(function (t) {
        var s = 0;
        var k = t >> 2;
        if (k === G.wildKind) s -= 100;
        if (G.doraKinds.indexOf(k) >= 0) s -= 30;
        if (R.isRed(t)) s -= 20;
        var rest = all13(p).slice();
        rest.splice(rest.indexOf(t), 1);
        s += R.waitsOf(kindsOf(rest), G.wildKind, p.melds.length).length * 8;
        if (s > bestScore) { bestScore = s; pick = t; }
      });
      return { discard: pick, riichi: true };
    }
    return { discard: AI.chooseDiscard(G, p) };
  }

  /* ================= 副露・和了の解決 ================= */
  function chiOptions(p, tile) {
    var k = tile >> 2;
    if (k >= R.HONOR) return [];
    var n = k % 9, base = k - n, opts = [];
    var have = {};
    p.hand.forEach(function (t) { (have[t >> 2] = have[t >> 2] || []).push(t); });
    function pick(a, b) {
      if (a < 0 || b > 8) return;
      var ka = base + a, kb = base + b;
      if (have[ka] && have[kb]) opts.push([have[ka][0], have[kb][0]]);
    }
    pick(n - 2, n - 1); pick(n - 1, n + 1); pick(n + 1, n + 2);
    return opts.filter(function (o) {
      var s = o.map(function (t) { return t >> 2; }).concat([k]).sort(function (a, b) { return a - b; });
      return s[1] === s[0] + 1 && s[2] === s[1] + 1;
    });
  }

  function countKind(p, k) {
    var n = 0; p.hand.forEach(function (t) { if ((t >> 2) === k) n++; });
    return n;
  }

  async function resolveCalls(discarder, tile) {
    var k = tile >> 2;
    var rons = [], claim = null;

    // それぞれの選択を集める
    var wants = [];
    for (var i = 1; i < 5; i++) {
      var p = G.players[(discarder.idx + i) % 5];
      var ron = canRon(p, tile);
      var canPon = !p.riichi && countKind(p, k) >= 2;
      var canKan = !p.riichi && countKind(p, k) === 3 && G.kanCount < 4 && G.wall.length > 0;
      var chis = (!p.riichi && p.idx === (discarder.idx + 1) % 5) ? chiOptions(p, tile) : [];
      wants.push({ p: p, ron: ron, pon: canPon, kan: canKan, chis: chis, order: i });
    }

    // 人間に一度だけ聞く
    var human = wants.filter(function (w) { return w.p.isHuman; })[0];
    var humanPick = null;
    if (human && (human.ron || human.pon || human.kan || human.chis.length)) {
      var btns = [];
      if (human.ron) btns.push({ key: 'ron', label: 'ロン', value: { t: 'ron' } });
      if (human.kan) btns.push({ key: 'kan', label: 'カン', value: { t: 'kan' } });
      if (human.pon) btns.push({ key: 'pon', label: 'ポン', value: { t: 'pon' } });
      human.chis.forEach(function (o, i) {
        btns.push({ key: 'chi', label: 'チー ' + o.map(function (t) { return R.kindName(t >> 2); }).join(''), value: { t: 'chi', o: o } });
      });
      btns.push({ key: 'pass', label: 'パス', value: { t: 'pass' } });
      setButtons(btns);
      $('info').innerHTML = '<b class="callable">' + R.kindName(k) + '</b> が出た';
      humanPick = await waitInput();
      setButtons([]);
      if (humanPick.t === 'pass' && human.ron) human.p.tempFuriten = true;
    }

    wants.forEach(function (w) {
      if (w.p.isHuman) {
        w.take = humanPick ? humanPick.t : 'pass';
        w.chi = humanPick && humanPick.o;
        return;
      }
      if (w.ron) { w.take = 'ron'; return; }
      if (w.kan && AI.wantKan(G, w.p, k) && AI.wantPon(G, w.p, k)) { w.take = 'kan'; return; }
      if (w.pon && AI.wantPon(G, w.p, k)) { w.take = 'pon'; return; }
      if (w.chis.length) {
        var c = AI.wantChi(G, w.p, k, w.chis);
        if (c) { w.take = 'chi'; w.chi = c; return; }
      }
      w.take = 'pass';
    });

    rons = wants.filter(function (w) { return w.take === 'ron'; });
    if (rons.length) return { rons: rons, tile: tile, from: discarder };

    var order = { kan: 3, pon: 2, chi: 1, pass: 0 };
    wants.sort(function (a, b) { return order[b.take] - order[a.take] || a.order - b.order; });
    if (wants[0].take !== 'pass') claim = wants[0];
    return { claim: claim, tile: tile, from: discarder };
  }

  function doMeld(w, tile, from) {
    var p = w.p, k = tile >> 2;
    var used = [];
    if (w.take === 'chi') used = w.chi.slice();
    else {
      var n = w.take === 'kan' ? 3 : 2;
      for (var i = 0; i < p.hand.length && used.length < n; i++) if ((p.hand[i] >> 2) === k) used.push(p.hand[i]);
    }
    used.forEach(function (t) { p.hand.splice(p.hand.indexOf(t), 1); });
    var tiles = used.concat([tile]).sort(byKind);
    var rotIdx = tiles.indexOf(tile);
    var type = w.take === 'kan' ? 'minkan' : (w.take === 'chi' ? 'chi' : 'pon');
    p.melds.push({ type: type, tiles: tiles, rotIdx: rotIdx, closed: false, from: from.idx });
    p.menzen = false;
    G.players.forEach(function (o) { o.ippatsu = false; });
  }

  /* ================= 演出つき進行 ================= */
  async function announce(p, text, kind) {
    Sfx.call();
    var seat = p.isHuman ? $('me') : $('seat' + p.idx);
    var bub = document.createElement('div');
    bub.className = 'bubble b-' + kind;
    bub.textContent = text;
    seat.appendChild(bub);
    Fx.shake(4, 220);
    await sleep(430 / speed);
    bub.remove();
  }

  async function riichiFx(p) {
    Sfx.riichi();
    Fx.flash('rgba(120,200,255,.55)', 260);
    Fx.speedlines(0.75, 'rgba(140,220,255,.55)', 40);
    Fx.shake(10, 420);
    var r = seatCenter(p);
    Fx.burst(r.x, r.y, 40, ['#8fe3ff', '#ffffff', '#4aa8ff'], { r: 3, speed: 9, g: 0.05, life: 50 });
    await Fx.cutin({ main: '立 直', sub: p.name, kind: 'riichi', ms: 950 / speed });
  }

  function seatCenter(p) {
    var el = p.isHuman ? $('me') : $('seat' + p.idx);
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ================= 1 局 ================= */
  async function playHand() {
    setupHand();
    render();
    await Fx.cutin({ main: '東' + (G.kyoku + 1) + '局', sub: '変化牌  ' + R.kindName(G.wildKind), kind: 'plain', ms: 1100 / speed });
    Fx.burst(global.innerWidth / 2, global.innerHeight / 2, 26, ['#ffd76a', '#fff'], { r: 4, speed: 8, life: 44 });

    var needDraw = true, rinshan = false;
    while (true) {
      var p = G.players[G.turn];
      p.rinshan = false;
      if (needDraw) {
        if (G.wall.length === 0) { await ryukyoku(); return; }
        drawTile(p, rinshan);
        p.rinshan = rinshan;
        if (!rinshan) p.tempFuriten = false;
        Sfx.draw();
        rinshan = false;
      }
      render();

      var act = p.isHuman ? await humanTurn(p) : await aiTurn(p);
      if (!act.win) p.ippatsu = false;   // 一発は自分の次の手番まで

      if (act.win) { await doWin([{ p: p, res: act.win }], p.drawn, true, null); return; }

      if (act.kan) {
        await doKan(p, act.kan);
        needDraw = true; rinshan = true;
        continue;
      }

      // 打牌
      var tile = act.discard;
      if (act.riichi) {
        p.riichi = true; p.riichiIdx = p.discards.length; p.ippatsu = true;
        p.score -= 1000; G.riichiSticks++;
        await riichiFx(p);
      }
      discardTile(p, tile, !!act.riichi);
      Sfx.clack();
      render();
      await sleep(act.riichi ? 120 : 180 / speed);

      var r = await resolveCalls(p, tile);
      if (r.rons) {
        p.discards[p.discards.length - 1].taken = true;
        await doWin(r.rons.map(function (w) { return { p: w.p, res: w.ron }; }), tile, false, p);
        return;
      }
      if (r.claim) {
        p.discards[p.discards.length - 1].taken = true;
        var w = r.claim;
        doMeld(w, tile, p);
        var label = w.take === 'kan' ? 'カン' : (w.take === 'chi' ? 'チー' : 'ポン');
        render();
        await announce(w.p, label, w.take);
        if (w.take === 'kan') {
          G.kanCount++;
          revealKanDora();
          G.turn = w.p.idx;
          needDraw = true; rinshan = true;
          continue;
        }
        G.turn = w.p.idx;
        w.p.drawn = null;
        needDraw = false;
        continue;
      }

      G.turn = (G.turn + 1) % 5;
      needDraw = true;
    }
  }

  function discardTile(p, tile, isRiichi) {
    if (p.drawn === tile) p.drawn = null;
    else {
      var i = p.hand.indexOf(tile);
      if (i >= 0) p.hand.splice(i, 1);
      if (p.drawn != null) { p.hand.push(p.drawn); p.drawn = null; }
    }
    p.hand.sort(byKind);
    p.discards.push({ tile: tile, riichi: isRiichi, taken: false });
    // 振聴の更新
    var waits = R.waitsOf(kindsOf(p.hand), G.wildKind, p.melds.length);
    p.furiten = p.discards.some(function (d) { return waits.indexOf(d.tile >> 2) >= 0; });
    // 立直者から見た安全牌
    G.players.forEach(function (o) {
      if (o.riichi && o.idx !== p.idx) G.safeAfter[o.idx].push(tile >> 2);
    });
  }

  async function doKan(p, kan) {
    if (kan.type === 'ankan') {
      var k = kan.kind, tiles = [];
      var pool = all13(p);
      pool.forEach(function (t) { if ((t >> 2) === k && tiles.length < 4) tiles.push(t); });
      tiles.forEach(function (t) {
        if (p.drawn === t) p.drawn = null;
        else p.hand.splice(p.hand.indexOf(t), 1);
      });
      if (p.drawn != null) { p.hand.push(p.drawn); p.drawn = null; }
      p.melds.push({ type: 'ankan', tiles: tiles.sort(byKind), rotIdx: -1, closed: true });
    } else {
      var o = kan.o;
      var m = p.melds[o.meld];
      if (p.drawn === o.tile) p.drawn = null;
      else p.hand.splice(p.hand.indexOf(o.tile), 1);
      if (p.drawn != null) { p.hand.push(p.drawn); p.drawn = null; }
      m.tiles.push(o.tile);
      m.type = 'minkan';
    }
    p.hand.sort(byKind);
    G.kanCount++;
    G.players.forEach(function (o) { o.ippatsu = false; });   // 鳴きで一発は消える
    render();
    await announce(p, 'カン', 'kan');
    revealKanDora();
  }

  function revealKanDora() {
    if (G.doraInd.length >= 5) return;
    var idx = G.doraInd.length;
    G.doraInd.push(G.dead[idx]);
    G.uraInd.push(G.dead[5 + idx]);
    G.doraKinds.push(R.nextKind(G.doraInd[idx] >> 2));
    Sfx.whoosh();
    Fx.flash('rgba(255,210,120,.35)', 220);
    renderHud();
  }

  /* ================= 和了 ================= */
  async function doWin(winners, tile, tsumo, from) {
    setButtons([]); setHandSelectable(false);
    var maxYakuman = 0;
    winners.forEach(function (w) { maxYakuman = Math.max(maxYakuman, w.res.yakuman); });

    if (tsumo) Sfx.tsumo(); else Sfx.ron();
    Fx.flash('#fff', 200);
    Fx.shake(maxYakuman ? 22 : 14, 620);
    Fx.speedlines(maxYakuman ? 1.6 : 0.9, maxYakuman ? 'rgba(255,214,106,.8)' : 'rgba(255,255,255,.75)', 54);
    var c = seatCenter(winners[0].p);
    Fx.burst(c.x, c.y, 60, maxYakuman ? ['#ffd76a', '#fff3c4', '#ff8a3d'] : ['#fff', '#7fe0ff', '#ffd76a'], { r: 5, speed: 12, life: 60 });
    await Fx.cutin({ main: tsumo ? 'ツ モ' : 'ロ ン', sub: winners.map(function (w) { return w.p.name; }).join(' / '), kind: tsumo ? 'tsumo' : 'ron', ms: 1000 / speed });

    if (maxYakuman > 0) {
      Sfx.gong();
      Fx.rain(90, ['#ffd76a', '#fff2bd', '#ffb03a'], { r: 9 });
      Fx.flash('rgba(255,214,106,.5)', 500);
      Fx.shake(16, 900);
      await Fx.cutin({ main: '役 満', sub: winners[0].res.yaku.filter(function (y) { return y.yakuman; }).map(function (y) { return y.name; }).join(' ・ '), kind: 'yakuman', ms: 1900 / speed });
    }

    // 点の移動
    var deltas = [0, 0, 0, 0, 0];
    winners.forEach(function (w, wi) {
      var p = w.p, res = w.res;
      var isDealer = p.idx === G.oya;
      var total = R.basePoints(res.han, res.yakuman, isDealer);
      var honba = G.honba * 300;
      if (tsumo) {
        var each = {};
        G.players.forEach(function (o) {
          if (o === p) return;
          var pay;
          if (isDealer) pay = Math.ceil(total / 4 / 100) * 100;
          else pay = (o.idx === G.oya) ? Math.ceil(total / 2 / 100) * 100 : Math.ceil(total / 6 / 100) * 100;
          pay += G.honba * 100;
          deltas[o.idx] -= pay;
          deltas[p.idx] += pay;
        });
      } else {
        deltas[from.idx] -= total + honba;
        deltas[p.idx] += total + honba;
      }
      w.total = total + (tsumo ? 0 : honba);
    });
    // 供託は頭ハネ（放銃者から近い和了者）
    if (G.riichiSticks) {
      deltas[winners[0].p.idx] += G.riichiSticks * 1000;
      G.riichiSticks = 0;
    }

    await showResult(winners, tile, tsumo, from, deltas);
    G.players.forEach(function (p, i) { p.score += deltas[i]; });
    G.honba = 0;
    render();
  }

  async function ryukyoku() {
    setButtons([]);
    Sfx.whoosh();
    await Fx.cutin({ main: '流 局', sub: '牌が尽きた', kind: 'plain', ms: 1000 / speed });
    var tenpai = G.players.filter(function (p) {
      return R.handShanten(kindsOf(all13(p)), G.wildKind, p.melds.length) === 0;
    });
    var noten = G.players.filter(function (p) { return tenpai.indexOf(p) < 0; });
    var deltas = [0, 0, 0, 0, 0];
    if (tenpai.length && noten.length) {
      var pay = Math.ceil(3000 / noten.length / 100) * 100;
      var get = Math.ceil(3000 / tenpai.length / 100) * 100;
      noten.forEach(function (p) { deltas[p.idx] -= pay; });
      tenpai.forEach(function (p) { deltas[p.idx] += get; });
    }
    await showDrawResult(tenpai, deltas);
    G.players.forEach(function (p, i) { p.score += deltas[i]; });
    G.honba++;
    render();
  }

  /* ================= 結果表示 ================= */
  function tileRow(tiles, size, opts) {
    var d = document.createElement('div');
    d.className = 'trow';
    tiles.forEach(function (t) { d.appendChild(mkTile(t, size || 'meld', opts || {})); });
    return d;
  }

  function showResult(winners, tile, tsumo, from, deltas) {
    return new Promise(function (done) {
      var m = $('modal');
      m.innerHTML = '';
      m.className = 'modal on' + (winners.some(function (w) { return w.res.yakuman; }) ? ' gold' : '');
      var card = document.createElement('div');
      card.className = 'card';

      winners.forEach(function (w) {
        var p = w.p, res = w.res;
        var head = document.createElement('div');
        head.className = 'res-head';
        head.innerHTML = '<span class="rh-name">' + p.name + '</span><span class="rh-way">' + (tsumo ? 'ツモ' : 'ロン') + '</span>' +
          (from ? '<span class="rh-from">放銃 ' + from.name + '</span>' : '');
        card.appendChild(head);

        var hand = document.createElement('div');
        hand.className = 'res-hand';
        var concealed = p.hand.slice().sort(byKind);
        hand.appendChild(tileRow(concealed, 'meld'));
        var winEl = mkTile(tile, 'meld', {});
        winEl.classList.add('winning');
        var wrap = document.createElement('div'); wrap.className = 'trow win-wrap';
        wrap.appendChild(winEl);
        hand.appendChild(wrap);
        p.melds.forEach(function (md) {
          hand.appendChild(tileRow(md.tiles, 'meld'));
        });
        card.appendChild(hand);

        var yl = document.createElement('div');
        yl.className = 'yakulist';
        card.appendChild(yl);

        var tot = document.createElement('div');
        tot.className = 'res-total';
        tot.innerHTML = '<span class="rank"></span><span class="pts">0</span>';
        card.appendChild(tot);

        w._yl = yl; w._tot = tot;
      });

      var table = document.createElement('div');
      table.className = 'deltas';
      G.players.forEach(function (p, i) {
        var e = document.createElement('div');
        e.className = 'dl' + (deltas[i] > 0 ? ' plus' : deltas[i] < 0 ? ' minus' : '');
        e.innerHTML = '<span>' + p.name + '</span><b>' + (deltas[i] > 0 ? '+' : '') + deltas[i] + '</b>';
        table.appendChild(e);
      });
      card.appendChild(table);

      var btn = document.createElement('button');
      btn.className = 'act act-next';
      btn.textContent = '次へ';
      btn.onclick = function () { m.className = 'modal'; done(); };
      card.appendChild(btn);
      m.appendChild(card);

      // 役を1つずつ出す（複数和了なら順番に）
      var queue = [];
      winners.forEach(function (w) {
        w.res.yaku.forEach(function (y) { queue.push({ w: w, y: y }); });
        queue.push({ w: w, done: true });
      });
      var i = 0;
      (function step() {
        if (i >= queue.length) return;
        var it = queue[i++];
        if (it.done) { countUp(it.w); setTimeout(step, 240 / speed); return; }
        var y = it.y;
        var e = document.createElement('div');
        e.className = 'yk' + (y.yakuman ? ' ym' : '');
        e.innerHTML = '<span>' + y.name + '</span><b>' + (y.yakuman ? '役満' : y.han + '<i class="han-u">飜</i>') + '</b>';
        it.w._yl.appendChild(e);
        Sfx.coin(i);
        setTimeout(step, 180 / speed);
      })();

      function countUp(w) {
        var target = w.total || 0;
        var rank = R.rankName(w.res.han, w.res.yakuman);
        w._tot.querySelector('.rank').innerHTML = rank ? rank + (w.res.yakuman ? '' : ' ' + w.res.han + '<i class="han-u">飜</i>') : w.res.han + '<i class="han-u">飜</i>';
        var n = 0, steps = 22, e = w._tot.querySelector('.pts');
        var iv = setInterval(function () {
          n++;
          e.textContent = Math.round(target * n / steps / 100) * 100;
          if (n >= steps) { clearInterval(iv); e.textContent = target; Sfx.coin(3); }
        }, 26 / speed);
      }
    });
  }

  function showDrawResult(tenpai, deltas) {
    return new Promise(function (done) {
      var m = $('modal');
      m.innerHTML = '';
      m.className = 'modal on';
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<div class="res-head"><span class="rh-name">流局</span></div>';
      var t = document.createElement('div');
      t.className = 'deltas';
      G.players.forEach(function (p, i) {
        var e = document.createElement('div');
        e.className = 'dl' + (deltas[i] > 0 ? ' plus' : deltas[i] < 0 ? ' minus' : '');
        e.innerHTML = '<span>' + p.name + (tenpai.indexOf(p) >= 0 ? ' 聴牌' : ' 不聴') + '</span><b>' + (deltas[i] > 0 ? '+' : '') + deltas[i] + '</b>';
        t.appendChild(e);
      });
      card.appendChild(t);
      var btn = document.createElement('button');
      btn.className = 'act act-next';
      btn.textContent = '次へ';
      btn.onclick = function () { m.className = 'modal'; done(); };
      card.appendChild(btn);
      m.appendChild(card);
    });
  }

  function showFinal() {
    var m = $('modal');
    m.innerHTML = '';
    m.className = 'modal on gold';
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="res-head"><span class="rh-name">終局</span></div>';
    var order = G.players.slice().sort(function (a, b) { return b.score - a.score; });
    var t = document.createElement('div');
    t.className = 'deltas final';
    order.forEach(function (p, i) {
      var e = document.createElement('div');
      e.className = 'dl' + (i === 0 ? ' plus' : '');
      e.innerHTML = '<span>' + (i + 1) + '位　' + p.name + '</span><b>' + p.score + '</b>';
      t.appendChild(e);
    });
    card.appendChild(t);
    var btn = document.createElement('button');
    btn.className = 'act act-next';
    btn.textContent = 'もう一度';
    btn.onclick = function () { m.className = 'modal'; start(); };
    card.appendChild(btn);
    m.appendChild(card);
    Sfx.gong();
    Fx.rain(70, ['#ffd76a', '#fff2bd'], { r: 8 });
  }

  /* ================= 起動 ================= */
  async function start() {
    newGame();
    for (G.kyoku = 0; G.kyoku < G.totalKyoku; G.kyoku++) {
      await playHand();
      await sleep(200);
    }
    showFinal();
  }

  function boot() {
    Fx.init($('fxc'));
    document.addEventListener('pointerdown', function () { Sfx.unlock(); }, { once: true });
    $('btn-sound').onclick = function () {
      Sfx.setMuted(!Sfx.isMuted());
      $('btn-sound').textContent = Sfx.isMuted() ? '🔇' : '🔊';
    };
    $('btn-speed').onclick = function () {
      speed = speed === 1 ? 2 : (speed === 2 ? 3 : 1);
      $('btn-speed').textContent = '×' + speed;
    };
    $('btn-help').onclick = function () { $('help').classList.add('on'); };
    $('help').onclick = function (e) { if (e.target.id === 'help' || e.target.classList.contains('act-next')) $('help').classList.remove('on'); };
    $('btn-start').onclick = function () {
      Sfx.unlock();
      $('title').classList.remove('on');
      start();
    };
    $('title').classList.add('on');
  }

  global.Game = { boot: boot, state: function () { return G; } };
})(window);
