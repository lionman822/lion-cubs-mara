// 开发用截图：npx electron tools/snap.js <输出目录> [JS脚本...]
// 用独立的 userData，不影响正式存档
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const out = process.argv[2];
const scripts = process.argv.slice(3);
app.setPath('userData', path.join(out, 'userdata'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 840, show: false, frame: false, webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), offscreen: false } });
  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(5000);
  let i = 0;
  for (const js of [''].concat(scripts)) {
    if (js) { await win.webContents.executeJavaScript(js); await wait(js.includes('playThreat') ? 3500 : 1500); }
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `shot${i++}.png`), img.toPNG());
  }
  app.quit();
});
