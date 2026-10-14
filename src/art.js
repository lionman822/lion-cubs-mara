// 美术素材加载：把图片放进 src/assets/ 即可替换像素画。缺失的文件自动回退到代码绘制。
// 精灵图若是纯色底（如纯绿、纯白），会自动抠掉底色并裁掉空白边。
(function (root) {
  // h：在场景里的显示高度（场景高 120 个单位 ≈ 窗口里 294 像素）
  const SPRITES = {
    lioness_lie: { h: 19 }, lioness_sit: { h: 30 }, lioness_walk: { h: 25 }, lioness_walk2: { h: 25 },
    cub_lie: { h: 7 }, cub_stand: { h: 10 },
    hyena: { h: 20 }, leopard: { h: 16 }, baboon: { h: 18 },
    elephant: { h: 54 }, buffalo: { h: 30 }, hippo: { h: 24 },
    fg_bush: { h: 0 }, // 前景灌丛：与背景同尺寸的透明图，叠在藏起来的幼崽前面
  };
  const BGS = ['bg_day', 'bg_dusk', 'bg_night'];
  const imgs = {};
  let bgCount = 0;

  function loadOne(name, exts) {
    return new Promise((resolve) => {
      const tryExt = (i) => {
        if (i >= exts.length) return resolve(null);
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => tryExt(i + 1);
        im.src = `assets/${name}.${exts[i]}`;
      };
      tryExt(0);
    });
  }

  // 纯色底抠图 + 裁边
  function process(im) {
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, c.width, c.height); } catch (e) { return c; }
    const p = d.data, W = c.width, H = c.height;
    const at = (x, y) => (y * W + x) * 4;
    const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];
    const opaque = corners.every((i) => p[i + 3] > 250);
    const dist = (i, j) => Math.abs(p[i] - p[j]) + Math.abs(p[i + 1] - p[j + 1]) + Math.abs(p[i + 2] - p[j + 2]);
    if (opaque && corners.every((i) => dist(i, corners[0]) < 40)) {
      const k = corners[0];
      const kr = p[k], kg = p[k + 1], kb = p[k + 2];
      const greenKey = kg > 150 && kr < 120 && kb < 120;
      for (let i = 0; i < p.length; i += 4) {
        const dd = Math.abs(p[i] - kr) + Math.abs(p[i + 1] - kg) + Math.abs(p[i + 2] - kb);
        if (dd < 60) p[i + 3] = 0;
        else if (dd < 110) p[i + 3] = Math.round(p[i + 3] * ((dd - 60) / 50));
        // 去绿边
        if (greenKey && p[i + 3] > 0 && p[i + 1] > Math.max(p[i], p[i + 2])) p[i + 1] = Math.max(p[i], p[i + 2]);
      }
      g.putImageData(d, 0, 0);
    }
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (p[at(x, y) + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return c;
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  async function load() {
    const jobs = [];
    for (const b of BGS) jobs.push(loadOne(b, ['png', 'jpg', 'jpeg', 'webp']).then((im) => { if (im) { imgs[b] = im; bgCount++; } }));
    for (const s in SPRITES) jobs.push(loadOne(s, ['png', 'webp']).then((im) => { if (im) imgs[s] = s === 'fg_bush' ? im : process(im); }));
    await Promise.all(jobs);
    return Art.ready;
  }

  const Art = {
    SPRITES, load,
    get ready() { return !!imgs.bg_day; },
    has: (n) => !!imgs[n],
    get: (n) => imgs[n],
    list: () => Object.keys(imgs),
  };
  root.LionArt = Art;
})(window);
