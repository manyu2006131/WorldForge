const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
let win, dir = null;
const id = () => crypto.randomUUID();
const blank = () => ({version:1,name:'未命名世界',maps:[{id:id(),name:'世界地图',width:4096,height:4096,background:null,backgroundOpacity:0.6,backgroundScale:1,backgroundX:0,backgroundY:0,shapes:[]}],characters:[],relations:[]});
const historyFile = () => path.join(app.getPath('userData'), 'recent.json');
async function recentAdd(p){let a=[]; try{a=JSON.parse(await fs.readFile(historyFile(),'utf8'))}catch{}; a=[p,...a.filter(x=>x!==p)].slice(0,10);await fs.mkdir(path.dirname(historyFile()),{recursive:true});await fs.writeFile(historyFile(),JSON.stringify(a));}
async function writeAtomic(file, data){const tmp=file+'.tmp';await fs.writeFile(tmp,data,'utf8'); await fs.rename(tmp,file);}
async function ensure(p){await fs.mkdir(path.join(p,'assets'),{recursive:true});await fs.mkdir(path.join(p,'backups'),{recursive:true});}
async function openProject(p){const data=JSON.parse(await fs.readFile(path.join(p,'project.json'),'utf8')); if(!Array.isArray(data.maps)||!Array.isArray(data.characters)||!Array.isArray(data.relations)) throw new Error('项目文件格式不正确');await ensure(p);dir=p;await recentAdd(p);return {dir,data};}
function handlers(){
 ipcMain.handle('new',async()=>{const r=await dialog.showOpenDialog(win,{title:'选择空文件夹作为项目',properties:['openDirectory','createDirectory']});if(r.canceled)return null; const p=r.filePaths[0]; try{await fs.access(path.join(p,'project.json'));throw new Error('该文件夹已有 project.json，请选择其他文件夹或使用打开项目。')}catch(e){if(e.code!=='ENOENT')throw e;}await ensure(p);await writeAtomic(path.join(p,'project.json'),JSON.stringify(blank(),null,2));return openProject(p)});
 ipcMain.handle('open',async()=>{const r=await dialog.showOpenDialog(win,{title:'选择项目文件夹',properties:['openDirectory']});return r.canceled?null:openProject(r.filePaths[0])});
 ipcMain.handle('open-path',async(_e,p)=>openProject(p));
 ipcMain.handle('recent',async()=>{try{return JSON.parse(await fs.readFile(historyFile(),'utf8'))}catch{return []}});
 ipcMain.handle('save',async(_e,data)=>{if(!dir)throw Error('尚未打开项目');const json=JSON.stringify(data,null,2);await writeAtomic(path.join(dir,'project.json'),json);const backupDir=path.join(dir,'backups');const stamp=new Date().toISOString().replace(/[:.]/g,'-');await fs.writeFile(path.join(backupDir,'auto-'+stamp+'-'+crypto.randomBytes(3).toString('hex')+'.json'),json);const backups=(await fs.readdir(backupDir)).filter(n=>/^auto-.*\.json$/.test(n)).sort().reverse();await Promise.all(backups.slice(20).map(n=>fs.unlink(path.join(backupDir,n))));return true});
 ipcMain.handle('asset',async()=>{if(!dir)throw Error('尚未打开项目');const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'图片',extensions:['png','jpg','jpeg','webp','gif']}]});if(r.canceled)return null;const bytes=await fs.readFile(r.filePaths[0]);const ext=path.extname(r.filePaths[0]).toLowerCase();const name=crypto.createHash('sha256').update(bytes).digest('hex')+ext;await fs.writeFile(path.join(dir,'assets',name),bytes);return name});
 ipcMain.handle('asset-data',async(_e,name)=>{if(!dir||typeof name!=='string'||path.basename(name)!==name)throw Error('图片路径无效');const ext=path.extname(name).slice(1).toLowerCase();if(!['png','jpg','jpeg','webp','gif'].includes(ext))throw Error('图片类型无效');return `data:image/${ext==='jpg'?'jpeg':ext};base64,${(await fs.readFile(path.join(dir,'assets',name))).toString('base64')}`});
}
app.whenReady().then(()=>{handlers();win=new BrowserWindow({width:1440,height:900,minWidth:900,minHeight:620,backgroundColor:'#10121c',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}}); if(process.env.VITE_DEV_SERVER_URL)win.loadURL(process.env.VITE_DEV_SERVER_URL);else win.loadFile(path.join(__dirname,'../dist/index.html'));win.on('close',e=>{if(!win.readyToClose){e.preventDefault();win.webContents.send('before-close')}});ipcMain.on('close-ready',()=>{win.readyToClose=true;win.close()});});
app.on('window-all-closed',()=>app.quit());
