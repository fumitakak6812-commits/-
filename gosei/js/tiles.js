/* 牌の描画（画像なし・全部 DOM と CSS） */
(function (global) {
  'use strict';
  var R = global.Rules;

  // 数字ごとのピンの並び（行ごとの個数）
  var PIP_ROWS = {
    1: [1], 2: [1, 1], 3: [1, 1, 1], 4: [2, 2], 5: [2, 1, 2],
    6: [3, 3], 7: [1, 3, 3], 8: [3, 2, 3], 9: [3, 3, 3]
  };

  function div(cls, text) {
    var e = document.createElement('div');
    e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function faceOf(kind) {
    var face = div('face');
    if (kind >= R.HONOR) {
      var k = R.HONOR_KANJI[kind - R.HONOR];
      var e = div('honor h-' + (kind - R.HONOR), k === '白' ? '' : k);
      if (k === '白') e.classList.add('haku');
      face.appendChild(e);
      face.classList.add('f-honor');
      return face;
    }
    var suit = R.suitOf(kind), num = R.numOf(kind);
    if (suit === 0) { // 萬子
      face.classList.add('f-man');
      face.appendChild(div('man-num', R.NUM_KANJI[num - 1]));
      face.appendChild(div('man-suit', '萬'));
      return face;
    }
    face.classList.add('f-pip', 'pip-' + 'mpsx'[suit]);
    var rows = PIP_ROWS[num];
    for (var r = 0; r < rows.length; r++) {
      var row = div('pip-row');
      for (var i = 0; i < rows[r]; i++) {
        row.appendChild(div('pip' + (suit === 2 && num === 1 ? ' pip-bird' : '')));
      }
      face.appendChild(row);
    }
    return face;
  }

  /* opts: {size:'hand'|'pond'|'meld'|'mini'|'huge', wild:bool, dora:bool,
   *        red:bool, rotated:bool, back:bool, dim:bool} */
  function tileEl(kind, opts) {
    opts = opts || {};
    var t = div('tile t-' + (opts.size || 'hand'));
    if (opts.back) { t.classList.add('back'); return t; }
    t.dataset.k = kind;
    t.classList.add('s-' + (kind >= R.HONOR ? 'z' : 'mpsx'[R.suitOf(kind)]));
    if (opts.wild) t.classList.add('wild');
    if (opts.dora) t.classList.add('dora');
    if (opts.red) t.classList.add('red');
    if (opts.rotated) t.classList.add('rot');
    if (opts.dim) t.classList.add('dim');
    t.appendChild(faceOf(kind));
    if (opts.wild) t.appendChild(div('wild-mark', '変'));
    return t;
  }

  function fromTile(tile, opts) {
    opts = opts || {};
    opts.red = R.isRed(tile);
    return tileEl(tile >> 2, opts);
  }

  global.Tiles = { el: tileEl, fromTile: fromTile, faceOf: faceOf };
})(window);
