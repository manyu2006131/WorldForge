const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

let window;
let projectDir;
let closing = false;
let allowClose = false;

const projectName = 'project.json';
const assetName = /^[a-f0-9]{64}\.(png|jpe?g|webp|gif)$/;
const backupName = /^auto-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-[a-f0-9]+\.json$/;
const imageExtensions = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/gif': 'gif' };
const historyFile = () => path.join(app.getPath('userData'), 'recent.json');

async function atomic(file, data) {
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function parseProject(bytes) {
  const data = JSON.parse(bytes);
  if (!data || ![1, 2].includes(data.version) || typeof data.name !== 'string' ||
      !Array.isArray(data.maps) || !data.maps.length || !Array.isArray(data.characters) ||
      !Array.isArray(data.relations)) throw Error('项目文件格式不正确。');
  return data;
}

async function getRecent() {
  let entries;
  try { entries = JSON.parse(await fs.readFile(historyFile(), 'utf8')); } catch { return []; }
  if (!Array.isArray(entries)) return [];
  return (await Promise.all(entries.slice(0, 10).filter(item => typeof item === 'string').map(async dir => {
    try {
      const data = parseProject(await fs.readFile(path.join(dir, projectName), 'utf8'));
      return { dir, name: data.name };
    } catch { return null; }
  }))).filter(Boolean);
}

async function openProject(dir) {
  const data = parseProject(await fs.readFile(path.join(dir, projectName), 'utf8'));
  const entries = await getRecent();
  const recent = [dir, ...entries.map(item => item.dir).filter(item => item !== dir)].slice(0, 10);
  await fs.mkdir(path.dirname(historyFile()), { recursive: true });
  await atomic(historyFile(), JSON.stringify(recent));
  projectDir = dir;
  return { dir, data };
}

function requireProject() {
  if (!projectDir) throw Error('尚未打开项目。');
  return projectDir;
}

function decode(data, allowed, limit) {
  if (typeof data !== 'string' || data.length > limit * 1.36 + 100) throw Error('文件大小超过限制。');
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(data);
  if (!match || !allowed.has(match[1])) throw Error('文件格式不支持。');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > limit) throw Error('文件大小超过限制。');
  return { mime: match[1], bytes };
}

function imageBytes(data) {
  return decode(data, new Set(Object.keys(imageExtensions)), 25 * 1024 * 1024);
}

async function listBackups(dir) {
  const directory = path.join(dir, 'backups');
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory);
  return entries.filter(file => backupName.test(file)).sort().reverse();
}

async function storeBackup(dir, bytes) {
  const directory = path.join(dir, 'backups');
  await fs.mkdir(directory, { recursive: true });
  const date = new Date().toISOString().replace(/[:.]/g, '-');
  await atomic(path.join(directory, 'auto-' + date + '-' + crypto.randomBytes(4).toString('hex') + '.json'), bytes);
}

async function pruneBackups(dir, preserve) {
  const files = await listBackups(dir);
  const keep = preserve ? [preserve, ...files.filter(file => file !== preserve)].slice(0, 20) : files.slice(0, 20);
  await Promise.all(files.filter(file => !keep.includes(file)).map(file =>
    fs.rm(path.join(dir, 'backups', file), { force: true })));
}

ipcMain.handle('create', async (_event, project, assets = {}) => {
  const json = JSON.stringify(project, null, 2);
  parseProject(json);
  const result = await dialog.showOpenDialog(window, { title: '选择空文件夹作为项目', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled) return null;
  const dir = result.filePaths[0];
  if ((await fs.readdir(dir)).length) throw Error('请选择一个空文件夹。');
  const images = Object.entries(assets).map(([name, value]) => {
    if (!assetName.test(name)) throw Error('图片文件名无效。');
    return [name, imageBytes(value).bytes];
  });
  const assetsDir = path.join(dir, 'assets');
  await fs.mkdir(assetsDir);
  try {
    for (const [name, bytes] of images) await atomic(path.join(assetsDir, name), bytes);
    await atomic(path.join(dir, projectName), json);
  } catch (error) {
    await fs.rm(assetsDir, { recursive: true, force: true });
    throw error;
  }
  return openProject(dir);
});

ipcMain.handle('open', async () => {
  const result = await dialog.showOpenDialog(window, { title: '选择已有项目文件夹', properties: ['openDirectory'] });
  return result.canceled ? null : openProject(result.filePaths[0]);
});
ipcMain.handle('recent', getRecent);
ipcMain.handle('open-path', async (_event, dir) => {
  if (!(await getRecent()).some(item => item.dir === dir)) throw Error('该项目不在最近列表中。');
  return openProject(dir);
});

ipcMain.handle('save', async (_event, project) => {
  const dir = requireProject();
  const json = JSON.stringify(project, null, 2);
  parseProject(json);
  await storeBackup(dir, json);
  await atomic(path.join(dir, projectName), json);
  await pruneBackups(dir);
  return true;
});

ipcMain.handle('backups', async () => (await listBackups(requireProject())).map(file => {
  const date = file.match(backupName)[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
  return { file, date };
}));

ipcMain.handle('restore', async (_event, file) => {
  const dir = requireProject();
  if (typeof file !== 'string' || !backupName.test(file)) throw Error('备份名称无效。');
  const old = await fs.readFile(path.join(dir, 'backups', file), 'utf8');
  const data = parseProject(old);
  const main = path.join(dir, projectName);
  await storeBackup(dir, await fs.readFile(main));
  await atomic(main, old);
  await pruneBackups(dir, file);
  return { dir, data };
});

ipcMain.handle('write-asset', async (_event, file) => {
  const dir = requireProject();
  const { mime, bytes } = imageBytes(file.data);
  const ext = imageExtensions[mime];
  const name = crypto.createHash('sha256').update(bytes).digest('hex') + '.' + ext;
  const assets = path.join(dir, 'assets');
  await fs.mkdir(assets, { recursive: true });
  await atomic(path.join(assets, name), bytes);
  return name;
});

ipcMain.handle('asset-data', async (_event, name) => {
  const dir = requireProject();
  if (typeof name !== 'string' || !assetName.test(name)) throw Error('图片文件名无效。');
  const ext = path.extname(name).slice(1);
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + ext;
  const bytes = await fs.readFile(path.join(dir, 'assets', name));
  return 'data:' + mime + ';base64,' + bytes.toString('base64');
});

ipcMain.handle('export-file', async (_event, file) => {
  const { bytes } = decode(file.data, new Set(['image/png', 'application/json']), 180 * 1024 * 1024);
  if (typeof file.name !== 'string' || file.name !== path.basename(file.name) || !/\.(png|json)$/.test(file.name)) throw Error('导出文件名无效。');
  const destination = await dialog.showSaveDialog(window, { defaultPath: file.name });
  if (destination.canceled) return false;
  await atomic(destination.filePath, bytes);
  return true;
});

app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 710, minHeight: 520, backgroundColor: '#14121e',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  if (process.env.VITE_DEV_SERVER_URL) window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.on('close', event => {
    if (allowClose) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    window.webContents.send('forge-flush', true);
    setTimeout(() => { closing = false; }, 1000).unref();
  });
  ipcMain.on('close-ready', event => {
    if (event.sender !== window.webContents) return;
    allowClose = true;
    window.close();
  });
});
app.on('window-all-closed', () => app.quit());
