/* 対局相手の思考 */
(function (global) {
  'use strict';
  var R = global.Rules;

  function allTiles(p) { return p.drawn != null ? p.hand.concat([p.drawn]) : p.hand.slice(); }
  function kindsOf(tiles) { return tiles.map(function (t) { return t >> 2; }); }

  function shantenOf(kinds, wild, meldCount) { return R.handShanten(kinds, wild, meldCount); }

  // 受け入れ枚数（種類数で近似）
  function ukeire(kinds, wild, meldCount, base) {
    var cand = {};
    kinds.forEach(function (k) {
      cand[k] = 1;
      if (k < R.HONOR) {
        var n = k % 9;
        if (n >= 2) cand[k - 2] = 1;
        if (n >= 1) cand[k - 1] = 1;
        if (n <= 7) cand[k + 1] = 1;
        if (n <= 6) cand[k + 2] = 1;
      }
    });
    if (wild >= 0) cand[wild] = 1;
    var n = 0;
    Object.keys(cand).forEach(function (k) {
      if (shantenOf(kinds.concat([+k]), wild, meldCount) < base) n++;
    });
    return n;
  }

  function isGenbutsu(state, target, kind) {
    for (var i = 0; i < target.discards.length; i++) if ((target.discards[i].tile >> 2) === kind) return true;
    // 立直後に他家が切って通った牌
    for (var j = 0; j < state.safeAfter[target.idx].length; j++) if (state.safeAfter[target.idx][j] === kind) return true;
    return false;
  }

  function danger(state, me, kind) {
    var d = 0;
    for (var i = 0; i < state.players.length; i++) {
      var o = state.players[i];
      if (o === me || !o.riichi) continue;
      if (isGenbutsu(state, o, kind)) continue;
      d += R.isYaochu(kind) ? 6 : 10;
      if (kind < R.HONOR) { var n = kind % 9; if (n >= 2 && n <= 6) d += 4; }
    }
    return d;
  }

  function chooseDiscard(state, p) {
    var tiles = allTiles(p);
    var wild = state.wildKind, mc = p.melds.length;
    var uniq = {}, cands = [];
    for (var i = 0; i < tiles.length; i++) {
      var k = tiles[i] >> 2;
      if (uniq[k]) continue;
      uniq[k] = 1;
      var rest = tiles.slice(); rest.splice(i, 1);
      var sh = shantenOf(kindsOf(rest), wild, mc);
      cands.push({ tile: tiles[i], idx: i, kind: k, sh: sh, rest: rest });
    }
    var best = 99;
    cands.forEach(function (c) { if (c.sh < best) best = c.sh; });
    var top = cands.filter(function (c) { return c.sh === best; });

    var riichiOut = state.players.some(function (o) { return o !== p && o.riichi; });
    var defensive = riichiOut && best >= 2;

    top.forEach(function (c) {
      var uk = top.length > 1 ? ukeire(kindsOf(c.rest), wild, mc, c.sh) : 0;
      var score = uk * 10;
      if (c.kind === wild) score -= 60;                    // 変化牌は絶対に残す
      if (state.doraKinds.indexOf(c.kind) >= 0) score -= 14;
      if (R.isRed(c.tile)) score -= 12;
      if (R.isDragon(c.kind) || c.kind === p.seatWind || c.kind === state.roundWind) score -= 4;
      score -= danger(state, p, c.kind) * (defensive ? 3 : 1);
      c.score = score;
    });
    top.sort(function (a, b) { return b.score - a.score; });
    return top[0].tile;
  }

  function wantRiichi(state, p, keepTiles) {
    if (!p.menzen || p.riichi || p.score < 1000) return false;
    if (state.wall.length < 4) return false;
    return true;
  }

  function hasYaochuInHand(p) {
    return p.hand.some(function (t) { return R.isYaochu(t >> 2); });
  }

  // 鳴くかどうか
  function wantPon(state, p, kind) {
    if (p.riichi) return false;
    var tiles = allTiles(p);
    var cur = shantenOf(kindsOf(tiles.concat([])), state.wildKind, p.melds.length);
    var rest = [], used = 0;
    for (var i = 0; i < tiles.length; i++) {
      if ((tiles[i] >> 2) === kind && used < 2) { used++; continue; }
      rest.push(tiles[i]);
    }
    if (used < 2) return false;
    var after = shantenOf(kindsOf(rest), state.wildKind, p.melds.length + 1);
    if (after >= cur) return false;
    var yakuhai = R.isDragon(kind) || kind === p.seatWind || kind === state.roundWind;
    if (yakuhai) return true;
    if (!p.menzen) return after <= 2;
    if (!hasYaochuInHand(p) && after <= 1) return true;   // 断幺で押す
    return after <= 0;
  }

  function wantChi(state, p, kind, options) {
    if (p.riichi || !options.length) return false;
    var tiles = allTiles(p);
    var cur = shantenOf(kindsOf(tiles), state.wildKind, p.melds.length);
    for (var o = 0; o < options.length; o++) {
      var need = options[o];
      var rest = tiles.slice(), ok = true;
      for (var i = 0; i < need.length; i++) {
        var idx = rest.findIndex(function (t) { return t === need[i]; });
        if (idx < 0) { ok = false; break; }
        rest.splice(idx, 1);
      }
      if (!ok) continue;
      var after = shantenOf(kindsOf(rest), state.wildKind, p.melds.length + 1);
      if (after < cur && !hasYaochuInHand(p) && after <= 1) return options[o];
      if (after < cur && !p.menzen && after <= 1) return options[o];
    }
    return false;
  }

  function wantKan(state, p, kind) {
    if (p.riichi) return false;
    return R.isDragon(kind) || kind === p.seatWind || Math.random() < 0.5;
  }

  global.AI = {
    chooseDiscard: chooseDiscard, wantRiichi: wantRiichi,
    wantPon: wantPon, wantChi: wantChi, wantKan: wantKan,
    allTiles: allTiles, kindsOf: kindsOf, ukeire: ukeire
  };
})(window);
