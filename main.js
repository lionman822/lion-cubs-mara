const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');

const FULL = { width: 1200, height: 840 };
const MINI = { width: 460, height: 46 };
let win, tray;
let status = { title: '', tooltip: '狮子养成记', line: '' };

function createWindow() {
  win = new BrowserWindow({
    ...FULL,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: true,
    title: '狮子养成记',
    // 后台也要按时推进模拟、发通知；画面在隐藏时由页面自己停掉
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function showWindow() { if (!win.isVisible()) win.show(); win.focus(); }

// ---------- 菜单栏 ----------
function buildTrayMenu() {
  const login = app.getLoginItemSettings().openAtLogin;
  const menu = Menu.buildFromTemplate([
    { label: status.line || 'Naramat 一家', enabled: false },
    { type: 'separator' },
    { label: '显示 / 隐藏', click: () => (win.isVisible() ? win.hide() : showWindow()) },
    { label: '窗口置顶', type: 'checkbox', checked: win.isAlwaysOnTop(), click: (i) => win.setAlwaysOnTop(i.checked, 'floating') },
    {
      label: '开机自动启动', type: 'checkbox', checked: login, enabled: app.isPackaged,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
    },
    { type: 'separator' },
    { label: '退出', role: 'quit' },
  ]);
  tray.setContextMenu(menu);
}
function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('🦁');
  tray.setToolTip('狮子养成记');
  buildTrayMenu();
}
ipcMain.on('app:status', (_e, st) => {
  const changed = st.line !== status.line;
  status = st;
  tray.setTitle('🦁 ' + (st.title || ''));
  tray.setToolTip(st.tooltip || '狮子养成记');
  if (changed) buildTrayMenu();
});

// ---------- 系统通知 ----------
ipcMain.on('app:notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on('click', showWindow);
  n.show();
});

// ---------- 窗口 ----------
ipcMain.on('win:mini', (_e, on) => {
  const [x, y] = win.getPosition();
  const s = on ? MINI : FULL;
  win.setBounds({ x, y, width: s.width, height: s.height });
});
ipcMain.handle('win:pin', () => {
  const on = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(on, 'floating');
  buildTrayMenu();
  return on;
});
ipcMain.handle('win:isPinned', () => win.isAlwaysOnTop());
ipcMain.on('win:close', () => app.quit());

app.whenReady().then(() => {
  createWindow();
  createTray();
});
app.on('window-all-closed', () => app.quit());
