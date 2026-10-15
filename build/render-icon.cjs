// Renders build/icon.svg to build/icon.png (512x512): npx electron build/render-icon.cjs build
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[process.argv.length - 1];
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true });
  await win.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const out = img.getSize().width === 512 ? img : img.resize({ width: 512, height: 512 });
  fs.writeFileSync(path.join(dir, 'icon.png'), out.toPNG());
  console.log('size', out.getSize());
  app.quit();
});
