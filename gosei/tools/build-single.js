/* gosei/ を1枚の HTML にまとめる。
 * Artifact など「ファイル1つしか置けない場所」に貼るとき用。
 *   node gosei/tools/build-single.js  > gosei-single.html
 * 出力は本文だけ（<!doctype>/<html>/<head>/<body> を含まない）。
 */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

let html = read('index.html');

// <body> の中身だけ取り出す
html = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));

// <script src="js/..."> を実体に差し替える
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g,
  (_, src) => '<script>\n' + read(src) + '\n</script>');

// Service Worker の登録は単体版では要らない
html = html.replace(/\s*if \('serviceWorker' in navigator\)[^\n]*\n/, '\n');

const fonts = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@700;800' +
  '&family=Zen+Kaku+Gothic+New:wght@500;700&display=swap';

process.stdout.write(
  '<title>五星麻雀</title>\n' +
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="' + fonts + '">\n' +
  '<style>\n' + read('style.css') + '\n</style>\n' +
  html.trim() + '\n');
