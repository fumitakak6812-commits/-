/* 五星麻雀 — ルールエンジン
 *
 * 牌の種類 (kind) は 0..43 の 44 種。
 *   0..8   萬子 1..9
 *   9..17  筒子 1..9
 *   18..26 索子 1..9
 *   27..35 星子 1..9      ← 4つ目のスート
 *   36..40 東 南 西 北 星  ← 5つ目の風
 *   41..43 白 發 中
 * 実体の牌 (tile) は 0..175 の通し番号で、kind = tile >> 2。
 * 各 kind の 0 番目の牌のうち 5 の牌は赤ドラ。
 */
(function (global) {
  'use strict';

  var KINDS = 44;
  var TILES = KINDS * 4;              // 176
  var HONOR = 36;                     // 字牌の開始 kind
  var WIND_FIRST = 36, WIND_LAST = 40; // 東南西北星
  var DRAGON_FIRST = 41, DRAGON_LAST = 43; // 白發中

  var SUIT_KANJI = ['萬', '筒', '索', '星'];
  var NUM_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var HONOR_KANJI = ['東', '南', '西', '北', '星', '白', '發', '中'];

  // 赤ドラ: 各スートの 5 の 1 枚目
  var REDS = {};
  for (var s = 0; s < 4; s++) REDS[(s * 9 + 4) * 4] = true;

  function suitOf(k) { return k < HONOR ? (k / 9) | 0 : -1; }
  function numOf(k) { return k < HONOR ? (k % 9) + 1 : 0; }
  function isHonor(k) { return k >= HONOR; }
  function isWind(k) { return k >= WIND_FIRST && k <= WIND_LAST; }
  function isDragon(k) { return k >= DRAGON_FIRST; }
  function isTerminal(k) { return k < HONOR && (k % 9 === 0 || k % 9 === 8); }
  function isYaochu(k) { return isHonor(k) || isTerminal(k); }
  function isRed(tile) { return !!REDS[tile]; }

  function kindName(k) {
    if (k >= HONOR) return HONOR_KANJI[k - HONOR];
    return NUM_KANJI[k % 9] + SUIT_KANJI[(k / 9) | 0];
  }

  // ドラ表示牌 → ドラ（＝変化牌）
  function nextKind(k) {
    if (k < HONOR) {
      var base = ((k / 9) | 0) * 9;
      return base + ((k - base + 1) % 9);
    }
    if (isWind(k)) return WIND_FIRST + ((k - WIND_FIRST + 1) % 5);
    return DRAGON_FIRST + ((k - DRAGON_FIRST + 1) % 3);
  }

  function newCounts() {
    var c = new Array(KINDS);
    for (var i = 0; i < KINDS; i++) c[i] = 0;
    return c;
  }

  function countsOfKinds(kinds) {
    var c = newCounts();
    for (var i = 0; i < kinds.length; i++) c[kinds[i]]++;
    return c;
  }

  function canRunAt(k) { return k < HONOR && (k % 9) <= 6; }

  /* ---------------------------------------------------------------
   * 和了形の分解（変化牌＝ジョーカーつき）
   * cnt: ジョーカーを除いた牌の枚数配列 / jokers: 変化牌の枚数
   * need: 面子の必要数（副露を除いた数）
   * 戻り値: [{sets:[{type:'run'|'pon',kind:k,jokers:n}], pair:kind, pairJokers:n}]
   * ------------------------------------------------------------- */
  function decompose(cnt, jokers, need) {
    var out = [], seen = {};

    function finish(c, j, sets, pair) {
      // 余ったジョーカーだけで面子・雀頭を作る
      var s = sets.slice(), jj = j, p = pair;
      while (s.length < need && jj >= 3) { s.push({ type: 'pon', kind: -1, jokers: 3 }); jj -= 3; }
      if (!p && jj >= 2) { p = { kind: -1, jokers: 2 }; jj -= 2; }
      if (s.length !== need || !p) return;
      var sig = s.map(function (x) { return x.type + x.kind; }).sort().join(',') + '|' + p.kind;
      if (seen[sig]) return;
      seen[sig] = 1;
      out.push({ sets: s, pair: p });
    }

    function rec(c, j, sets, pair, start) {
      if (sets.length > need) return;
      var i = start;
      while (i < KINDS && c[i] === 0) i++;
      if (i >= KINDS) { finish(c, j, sets, pair); return; }
      if (sets.length === need && pair) return; // これ以上置けない

      // 雀頭
      if (!pair) {
        if (c[i] >= 2) {
          c[i] -= 2; rec(c, j, sets, { kind: i, jokers: 0 }, i); c[i] += 2;
        }
        if (c[i] >= 1 && j >= 1) {
          c[i] -= 1; rec(c, j - 1, sets, { kind: i, jokers: 1 }, i); c[i] += 1;
        }
      }
      if (sets.length < need) {
        // 刻子
        for (var use = 3; use >= 1; use--) {
          var jn = 3 - use;
          if (c[i] >= use && j >= jn) {
            c[i] -= use;
            sets.push({ type: 'pon', kind: i, jokers: jn });
            rec(c, j - jn, sets, pair, i);
            sets.pop();
            c[i] += use;
          }
        }
        // 順子（i を必ず使う）
        if (canRunAt(i)) {
          for (var m = 0; m < 4; m++) {
            var needJ = 0, ok = true;
            // m のビットで i+1, i+2 をジョーカーで埋めるか決める
            var useB = !(m & 1), useC = !(m & 2);
            if (useB) { if (c[i + 1] < 1) ok = false; } else needJ++;
            if (useC) { if (c[i + 2] < 1) ok = false; } else needJ++;
            if (!ok || j < needJ) continue;
            c[i]--; if (useB) c[i + 1]--; if (useC) c[i + 2]--;
            sets.push({ type: 'run', kind: i, jokers: needJ });
            rec(c, j - needJ, sets, pair, i);
            sets.pop();
            c[i]++; if (useB) c[i + 1]++; if (useC) c[i + 2]++;
          }
        }
      }
    }

    rec(cnt.slice(), jokers, [], null, 0);
    return out;
  }

  // 七対子（変化牌は足りない対子を埋める）
  function chiitoiOk(cnt, jokers) {
    var pairs = 0, singles = 0;
    for (var i = 0; i < KINDS; i++) {
      if (cnt[i] > 2) return false;
      if (cnt[i] === 2) pairs++;
      else if (cnt[i] === 1) singles++;
    }
    if (jokers < singles) return false;
    var rest = jokers - singles;
    if (rest % 2 !== 0) return false;
    return pairs + singles + rest / 2 === 7;
  }

  // 無双（幺九 16 種のうち 14 種を 1 枚ずつ）— この麻雀の国士無双
  function musouOk(cnt, jokers) {
    var distinct = 0, extra = 0;
    for (var i = 0; i < KINDS; i++) {
      if (cnt[i] === 0) continue;
      if (!isYaochu(i)) return false;
      distinct++;
      extra += cnt[i] - 1;
    }
    if (extra > 0) return false;
    return distinct + jokers === 14;
  }

  /* ---------------------------------------------------------------
   * 向聴数
   * ------------------------------------------------------------- */
  var stCache = {};

  function stdShantenCore(cnt, meldCount) {
    var key = cnt.join('') + ':' + meldCount;
    if (stCache[key] !== undefined) return stCache[key];
    var bestScore = 99;

    function score(m, p, pair) {
      var mm = m + meldCount;
      var t = p + pair;
      if (mm + t > 5) t = 5 - mm;
      var sh = 8 - 2 * mm - t;
      if (mm + t === 5 && pair === 0) sh += 1;
      return sh;
    }

    function rec(c, i, m, p, pair) {
      if (m + meldCount + p + pair > 5) return;
      while (i < KINDS && c[i] === 0) i++;
      if (i >= KINDS) {
        var sh = score(m, p, pair);
        if (sh < bestScore) bestScore = sh;
        return;
      }
      if (c[i] >= 3) { c[i] -= 3; rec(c, i, m + 1, p, pair); c[i] += 3; }
      if (canRunAt(i) && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--; rec(c, i, m + 1, p, pair); c[i]++; c[i + 1]++; c[i + 2]++;
      }
      if (c[i] >= 2) {
        if (pair === 0) { c[i] -= 2; rec(c, i, m, p, 1); c[i] += 2; }
        c[i] -= 2; rec(c, i, m, p + 1, pair); c[i] += 2;
      }
      if (canRunAt(i) && c[i + 1] > 0) {
        c[i]--; c[i + 1]--; rec(c, i, m, p + 1, pair); c[i]++; c[i + 1]++;
      }
      if (k2ok(i) && c[i + 2] > 0) {
        c[i]--; c[i + 2]--; rec(c, i, m, p + 1, pair); c[i]++; c[i + 2]++;
      }
      c[i]--; rec(c, i, m, p, pair); c[i]++;
    }
    function k2ok(i) { return i < HONOR && (i % 9) <= 6; }

    rec(cnt.slice(), 0, 0, 0, 0);
    stCache[key] = bestScore;
    return bestScore;
  }

  // 変化牌は 1 枚につきおよそ 1 向聴ぶん働く
  function shanten(cnt, jokers, meldCount) {
    var std = stdShantenCore(cnt, meldCount) - jokers;
    var best = std;
    if (meldCount === 0) {
      var c7 = chiitoiShanten(cnt) - jokers;
      if (c7 < best) best = c7;
      var m13 = musouShanten(cnt) - jokers;
      if (m13 < best) best = m13;
    }
    return best < -1 ? -1 : best;
  }

  function chiitoiShanten(cnt) {
    var pairs = 0, kinds = 0;
    for (var i = 0; i < KINDS; i++) {
      if (cnt[i] > 0) kinds++;
      if (cnt[i] >= 2) pairs++;
    }
    var sh = 6 - pairs;
    if (kinds < 7) sh += 7 - kinds;
    return sh;
  }

  function musouShanten(cnt) {
    var distinct = 0;
    for (var i = 0; i < KINDS; i++) if (isYaochu(i) && cnt[i] > 0) distinct++;
    return 13 - distinct;
  }

  // 手牌 (kinds 配列, 変化牌は wildKind で判定) が和了形か
  function isAgari(kinds, wildKind, meldCount) {
    var d = splitWild(kinds, wildKind);
    var need = 4 - meldCount;
    if (decompose(d.cnt, d.jokers, need).length > 0) return true;
    if (meldCount === 0 && chiitoiOk(d.cnt, d.jokers)) return true;
    if (meldCount === 0 && musouOk(d.cnt, d.jokers)) return true;
    return false;
  }

  function splitWild(kinds, wildKind) {
    var cnt = newCounts(), jokers = 0;
    for (var i = 0; i < kinds.length; i++) {
      if (kinds[i] === wildKind) jokers++;
      else cnt[kinds[i]]++;
    }
    return { cnt: cnt, jokers: jokers };
  }

  function handShanten(kinds, wildKind, meldCount) {
    var d = splitWild(kinds, wildKind);
    return shanten(d.cnt, d.jokers, meldCount);
  }

  // 待ち牌（13枚 + 副露 の状態から）
  function waitsOf(kinds, wildKind, meldCount) {
    var res = [];
    for (var k = 0; k < KINDS; k++) {
      if (isAgari(kinds.concat([k]), wildKind, meldCount)) res.push(k);
    }
    return res;
  }

  /* ---------------------------------------------------------------
   * 役の判定
   * ctx = {
   *   handKinds: 手牌14枚(副露を除く+和了牌), melds: [{type:'pon'|'chi'|'ankan'|'minkan', kinds:[..], closed:bool}],
   *   winKind, wildKind, tsumo, riichi, doubleRiichi, ippatsu, menzen,
   *   seatWind, roundWind, rinshan, haitei, houtei, chankan
   * }
   * ------------------------------------------------------------- */
  function judge(ctx) {
    var d = splitWild(ctx.handKinds, ctx.wildKind);
    var meldCount = ctx.melds.length;
    var need = 4 - meldCount;
    var cands = [];

    var decs = decompose(d.cnt, d.jokers, need);
    for (var i = 0; i < decs.length; i++) cands.push({ kind: 'std', dec: decs[i] });
    if (meldCount === 0) {
      if (chiitoiOk(d.cnt, d.jokers)) cands.push({ kind: 'chiitoi' });
      if (musouOk(d.cnt, d.jokers)) cands.push({ kind: 'musou' });
    }
    if (!cands.length) return null;

    var best = null;
    for (var c = 0; c < cands.length; c++) {
      var r = scoreCandidate(ctx, cands[c]);
      if (!r) continue;
      if (!best || r.rank > best.rank) best = r;
    }
    return best;
  }

  function meldSets(melds) {
    return melds.map(function (m) {
      var ks = m.kinds || m.tiles.map(function (t) { return t >> 2; });
      var t = (m.type === 'chi') ? 'run' : 'pon';
      return {
        type: t, kind: Math.min.apply(null, ks), jokers: 0,
        open: !m.closed, kan: m.type === 'ankan' || m.type === 'minkan'
      };
    });
  }

  function scoreCandidate(ctx, cand) {
    var yaku = [], han = 0, yakuman = 0;
    var menzen = ctx.menzen;
    var melds = ctx.melds || [];
    var openMelds = melds.filter(function (m) { return !m.closed; });

    function add(name, h) { yaku.push({ name: name, han: h }); han += h; }
    function addYakuman(name, mult) { yaku.push({ name: name, han: 0, yakuman: mult || 1 }); yakuman += (mult || 1); }

    if (cand.kind === 'musou') {
      addYakuman('無双', 1);
    } else if (cand.kind === 'chiitoi') {
      add('七対子', 2);
      var allY = true, allHonor = true;
      var hk = ctx.handKinds;
      for (var q = 0; q < hk.length; q++) {
        if (!isYaochu(hk[q])) allY = false;
        if (!isHonor(hk[q])) allHonor = false;
      }
      if (allHonor) addYakuman('字一色', 1);
      else if (allY) add('混老頭', 2);
      if (isTanyao(hk)) add('断幺九', 1);
      var fl = flushOf(hk);
      if (fl.chin) add('清一色', 6); else if (fl.hon) add('混一色', 3);
      if (fl.sei) addYakuman('星一色', 1);
    } else {
      var sets = cand.dec.sets.concat(meldSets(melds));
      var pair = cand.dec.pair;
      var res = stdYaku(ctx, sets, pair);
      yaku = yaku.concat(res.yaku);
      han += res.han;
      yakuman += res.yakuman;
    }

    // 状況役
    if (yakuman === 0) {
      if (ctx.riichi) add(ctx.doubleRiichi ? 'ダブル立直' : '立直', ctx.doubleRiichi ? 2 : 1);
      if (ctx.ippatsu) add('一発', 1);
      if (ctx.tsumo && menzen) add('門前清自摸和', 1);
      if (ctx.rinshan) add('嶺上開花', 1);
      if (ctx.haitei) add('海底摸月', 1);
      if (ctx.houtei) add('河底撈魚', 1);
      if (ctx.chankan) add('槍槓', 1);
      if (han === 0) return null; // 役なし
    }

    // ドラ（＝変化牌）
    var doraHan = 0;
    if (yakuman === 0) {
      doraHan = ctx.doraCount || 0;
      if (doraHan > 0) yaku.push({ name: 'ドラ', han: doraHan });
      if (ctx.redCount) yaku.push({ name: '赤ドラ', han: ctx.redCount });
      if (ctx.uraCount) yaku.push({ name: '裏ドラ', han: ctx.uraCount });
      han += doraHan + (ctx.redCount || 0) + (ctx.uraCount || 0);
    }

    var rank = yakuman > 0 ? 1000 + yakuman * 100 : han;
    return { yaku: yaku, han: han, yakuman: yakuman, rank: rank };
  }

  function isTanyao(kinds) {
    for (var i = 0; i < kinds.length; i++) if (isYaochu(kinds[i])) return false;
    return true;
  }

  function flushOf(kinds) {
    var suits = {}, honor = false;
    for (var i = 0; i < kinds.length; i++) {
      var k = kinds[i];
      if (isHonor(k)) honor = true; else suits[suitOf(k)] = true;
    }
    var n = Object.keys(suits).length;
    var only = n === 1 ? +Object.keys(suits)[0] : -1;
    return {
      chin: n === 1 && !honor,
      hon: n === 1 && honor,
      // 星一色: 星子 + 星（風牌）だけ
      sei: (only === 3 || n === 0) && kinds.every(function (k) { return suitOf(k) === 3 || k === 40; }) && kinds.some(function (k) { return suitOf(k) === 3; })
    };
  }

  function stdYaku(ctx, sets, pair) {
    var yaku = [], han = 0, yakuman = 0;
    function add(n, h) { yaku.push({ name: n, han: h }); han += h; }
    function addYM(n, m) { yaku.push({ name: n, han: 0, yakuman: m || 1 }); yakuman += (m || 1); }

    var menzen = ctx.menzen;
    var open = !menzen;
    var runs = sets.filter(function (s) { return s.type === 'run'; });
    var pons = sets.filter(function (s) { return s.type === 'pon'; });
    var allKinds = tilesOfSets(sets, pair);

    // --- 役満 ---
    // 四色同順: 4スート同じ数字の順子
    var runStart = {};
    runs.forEach(function (r) {
      if (r.kind < 0) return;
      var n = r.kind % 9, s = suitOf(r.kind);
      runStart[n] = runStart[n] || {};
      runStart[n][s] = true;
    });
    var fourColor = false, threeColor = false;
    Object.keys(runStart).forEach(function (n) {
      var c = Object.keys(runStart[n]).length;
      if (c >= 4) fourColor = true;
      else if (c >= 3) threeColor = true;
    });
    if (fourColor) addYM('四色同順', 1);

    // 五風連合: 風牌の刻子 4 + 残り 1 種の風の雀頭
    var windPons = pons.filter(function (p) { return isWind(p.kind); }).length;
    if (windPons >= 4 && pair.kind >= 0 && isWind(pair.kind)) addYM('五風連合', 1);

    var dragonPons = pons.filter(function (p) { return isDragon(p.kind); }).length;
    if (dragonPons === 3) addYM('大三元', 1);

    var concealedPons = pons.filter(function (p) { return !p.open; }).length;
    if (concealedPons === 4) addYM('四暗刻', 1);

    if (allKinds.every(isHonor)) addYM('字一色', 1);
    if (allKinds.every(function (k) { return isTerminal(k); })) addYM('清老頭', 1);

    var fl = flushOf(allKinds);
    if (fl.sei) addYM('星一色', 1);

    if (yakuman > 0) return { yaku: yaku, han: 0, yakuman: yakuman };

    // --- 通常役 ---
    if (fourColor) { /* 到達しない */ }
    if (threeColor) add('三色同順', open ? 1 : 2);

    // 一気通貫
    var bySuitRuns = {};
    runs.forEach(function (r) {
      if (r.kind < 0) return;
      var s = suitOf(r.kind);
      (bySuitRuns[s] = bySuitRuns[s] || {})[r.kind % 9] = true;
    });
    var ittsu = Object.keys(bySuitRuns).some(function (s) {
      return bySuitRuns[s][0] && bySuitRuns[s][3] && bySuitRuns[s][6];
    });
    if (ittsu) add('一気通貫', open ? 1 : 2);

    // 対々和 / 三暗刻
    if (pons.length === 4) add('対々和', 2);
    if (concealedPons === 3) add('三暗刻', 2);

    // 小三元
    if (dragonPons === 2 && pair.kind >= 0 && isDragon(pair.kind)) add('小三元', 2);

    // 役牌
    var yakuhaiNames = { 41: '白', 42: '發', 43: '中' };
    pons.forEach(function (p) {
      if (isDragon(p.kind)) add('役牌 ' + yakuhaiNames[p.kind], 1);
      else if (p.kind === ctx.seatWind) add('自風 ' + kindName(p.kind), 1);
      if (p.kind === ctx.roundWind && p.kind !== ctx.seatWind && isWind(p.kind)) add('場風 ' + kindName(p.kind), 1);
    });

    // 断幺九 / 全帯
    if (isTanyao(allKinds)) add('断幺九', 1);
    else {
      var everySetHasY = sets.every(function (s) { return setHasYaochu(s); }) && (pair.kind < 0 || isYaochu(pair.kind));
      if (everySetHasY) {
        var pureY = allKinds.every(function (k) { return true; }) &&
          sets.every(function (s) { return setHasTerminalOnly(s); }) && (pair.kind < 0 || isTerminal(pair.kind));
        if (pureY) add('純全帯幺九', open ? 2 : 3);
        else add('混全帯幺九', open ? 1 : 2);
      }
    }

    // 混老頭
    if (allKinds.every(isYaochu) && pons.length === 4) add('混老頭', 2);

    // 一盃口 / 二盃口
    if (menzen) {
      var rc = {};
      runs.forEach(function (r) { if (r.kind >= 0) rc[r.kind] = (rc[r.kind] || 0) + 1; });
      var iipeiko = 0;
      Object.keys(rc).forEach(function (k) { iipeiko += (rc[k] / 2) | 0; });
      if (iipeiko >= 2) add('二盃口', 3);
      else if (iipeiko === 1) add('一盃口', 1);
    }

    // 平和（簡略: 門前・全順子・雀頭が役牌でない）
    if (menzen && runs.length === 4 && pair.kind >= 0 &&
      !isDragon(pair.kind) && pair.kind !== ctx.seatWind && pair.kind !== ctx.roundWind) {
      add('平和', 1);
    }

    if (fl.chin) add('清一色', open ? 5 : 6);
    else if (fl.hon) add('混一色', open ? 2 : 3);

    return { yaku: yaku, han: han, yakuman: 0 };
  }

  function setHasYaochu(s) {
    if (s.kind < 0) return true; // 変化牌だけの面子は好きに解釈できる
    if (s.type === 'pon') return isYaochu(s.kind);
    return (s.kind % 9) === 0 || (s.kind % 9) === 6;
  }
  function setHasTerminalOnly(s) {
    if (s.kind < 0) return true;
    if (isHonor(s.kind)) return false;
    if (s.type === 'pon') return isTerminal(s.kind);
    return (s.kind % 9) === 0 || (s.kind % 9) === 6;
  }

  function tilesOfSets(sets, pair) {
    var out = [];
    sets.forEach(function (s) {
      if (s.kind < 0) return;
      if (s.type === 'run') out.push(s.kind, s.kind + 1, s.kind + 2);
      else out.push(s.kind, s.kind, s.kind);
    });
    if (pair && pair.kind >= 0) out.push(pair.kind, pair.kind);
    return out;
  }

  /* ---------------------------------------------------------------
   * 点数（符なしの簡略テーブル）
   * ------------------------------------------------------------- */
  function basePoints(han, yakuman, isDealer) {
    var t;
    if (yakuman > 0) t = 32000 * yakuman;
    else if (han >= 13) t = 32000;
    else if (han >= 11) t = 24000;
    else if (han >= 8) t = 16000;
    else if (han >= 6) t = 12000;
    else if (han >= 5) t = 8000;
    else if (han === 4) t = 8000;
    else if (han === 3) t = 3900;
    else if (han === 2) t = 2000;
    else t = 1000;
    return isDealer ? Math.round(t * 1.5 / 100) * 100 : t;
  }

  function rankName(han, yakuman) {
    if (yakuman >= 2) return yakuman + '倍役満';
    if (yakuman === 1) return '役満';
    if (han >= 13) return '数え役満';
    if (han >= 11) return '三倍満';
    if (han >= 8) return '倍満';
    if (han >= 6) return '跳満';
    if (han >= 4) return '満貫';
    return '';
  }

  var API = {
    KINDS: KINDS, TILES: TILES, HONOR: HONOR,
    WIND_FIRST: WIND_FIRST, WIND_LAST: WIND_LAST,
    DRAGON_FIRST: DRAGON_FIRST,
    SUIT_KANJI: SUIT_KANJI, NUM_KANJI: NUM_KANJI, HONOR_KANJI: HONOR_KANJI,
    suitOf: suitOf, numOf: numOf, isHonor: isHonor, isWind: isWind, isDragon: isDragon,
    isTerminal: isTerminal, isYaochu: isYaochu, isRed: isRed, kindName: kindName,
    nextKind: nextKind, newCounts: newCounts, countsOfKinds: countsOfKinds,
    splitWild: splitWild, decompose: decompose, chiitoiOk: chiitoiOk, musouOk: musouOk,
    isAgari: isAgari, handShanten: handShanten, waitsOf: waitsOf,
    judge: judge, basePoints: basePoints, rankName: rankName
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Rules = API;
})(typeof window !== 'undefined' ? window : globalThis);
