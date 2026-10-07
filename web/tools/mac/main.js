// Barber Empire desktop shell: one window with the single-file game in it.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 860, minWidth: 960, minHeight: 540,
    title: 'Barber Empire', backgroundColor: '#15100c', show: false,
    webPreferences: { contextIsolation: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Barber Empire', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { role: 'reload' }] },
    { role: 'windowMenu' },
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
