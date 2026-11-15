import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Characters } from './Characters';
import { MapEditor } from './MapEditor';
import { Relations } from './Relations';
import { readData, report } from './files';
import { blankProject, demoProject, namify, projectExport, projectImport } from './project';
import { useStore } from './store';
import type { Backup, OpenedProject, RecentProject } from './types';
import './style.css';

const screens = ['地图', '人物', '关系图'] as const;

function App() {
  const { project, dir, revision, undoStack, redoStack, open, close, edit, undo, redo } = useStore();
  const [screen, setScreen] = useState<(typeof screens)[number]>('地图');
  const [mapId, setMapId] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [status, setStatus] = useState('已保存');
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const action = useRef(false);
  const saved = useRef(0);
  const queue = useRef(Promise.resolve());

  const refresh = () => window.forge.recent().then(setRecent).catch(console.error);
  const save = useCallback(() => {
    const next = queue.current.catch(() => {}).then(async () => {
      const snapshot = useStore.getState();
      if (!snapshot.project || snapshot.revision === saved.current) return;
      setStatus('保存中…');
      try {
        await window.forge.save(snapshot.project);
        saved.current = snapshot.revision;
        setStatus(useStore.getState().revision === snapshot.revision ? '已保存' : '待保存');
      } catch (error) {
        setStatus('保存失败');
        throw error;
      }
    });
    queue.current = next;
    return next;
  }, []);

  useEffect(() => {
    refresh();
    window.forge.onFlush(close => save().then(() => {
      if (close && !action.current) window.forge.closeReady();
    }).catch(report));
  }, [save]);

  useEffect(() => {
    if (!project || !revision) return;
    setStatus('待保存');
    const timer = setTimeout(() => save().catch(console.error), 3000);
    return () => clearTimeout(timer);
  }, [revision, dir, save]);

  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (action.current || !(event.ctrlKey || event.metaKey)) return;
      const name = event.key.toLowerCase();
      if (name === 's') { event.preventDefault(); save().catch(report); }
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
      if (name === 'z' || name === 'y') { event.preventDefault(); if (name === 'y' || event.shiftKey) redo(); else undo(); }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [save, undo, redo]);

  async function run(fn: () => Promise<void>) {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    try { await fn(); } catch (error) { report(error); }
    finally { action.current = false; setBusy(false); }
  }

  function changeProject(fn: () => Promise<OpenedProject | null>) {
    return run(async () => {
      await save();
      const result = await fn();
      if (!result) return;
      open(result);
      saved.current = 0;
      setStatus('已保存');
      setScreen('地图');
      setMapId(result.data.maps[0]?.id ?? '');
      setCharacterId('');
      setBackups(null);
      refresh();
    });
  }

  const newProject = (demo = false) => changeProject(() => window.forge.create(demo ? demoProject() : blankProject()));
  const map = project?.maps.find(item => item.id === mapId) ?? project?.maps[0];
  const openCharacter = (id: string) => { setCharacterId(id); setScreen('人物'); };
  const openMap = (id: string) => { setMapId(id); setScreen('地图'); };
  const mobile = window.forge.mobile;
  const projectPicker = <label className="file-button">导入项目 JSON<input type="file" accept=".json,application/json" onChange={event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) changeProject(async () => {
      const { project, assets } = projectImport(await file.text());
      return window.forge.create(project, assets);
    });
  }} /></label>;

  return <>
    <header>
      <div className="brand"><b>✦</b><span>{mobile ? '傅里叶大帝的专属游戏制作工具箱' : '世界工坊'}<small>WORLDFORGE</small></span></div>
      {project && <div className="top">
        <input className="project-name" aria-label="项目名称" value={project.name} onChange={event => edit(value => { value.name = event.target.value; })} />
        <span className="save-state" role="status">{status}</span>
        <button aria-label="撤销" disabled={!undoStack.length || busy} onClick={undo}>↶</button>
        <button aria-label="重做" disabled={!redoStack.length || busy} onClick={redo}>↷</button>
        <button disabled={busy} onClick={() => save().catch(report)}>保存</button>
      </div>}
    </header>
    {!project ? <div className="welcome">
      <div className="welcome-title"><span>✦</span><h1>为你的故事<br /><i>建造一个世界。</i></h1></div>
      <p>在本地绘制地图、记录人物，并把他们的故事连起来。</p>
      <div className="inline">
        <button className="primary" disabled={busy} onClick={() => newProject()}>＋ 新建项目</button>
        {!mobile && <button disabled={busy} onClick={() => changeProject(window.forge.open)}>打开项目文件夹</button>}
        <button disabled={busy} onClick={() => newProject(true)}>创建示例项目</button>
        {projectPicker}
      </div>
      {recent.length > 0 && <section><h3>{mobile ? '本机项目' : '最近打开'}</h3>{recent.map(item =>
        <button className="recent" disabled={busy} key={item.dir} onClick={() => changeProject(() => window.forge.openPath(item.dir))}>
          <strong>{item.name}</strong>{!mobile && <small>{item.dir}</small>}
        </button>)}</section>}
    </div> : <>
      <div className="layout" inert={busy}>
        <nav aria-label="工作空间">
          {screens.map((item, i) => <button className={'nav ' + (screen === item ? 'active' : '')} key={item} onClick={() => setScreen(item)}>
            <span aria-hidden>{['▧', '◉', '⌘'][i]}</span>{item}</button>)}
          <div className="nav-bottom">
            <button onClick={() => run(async () => {
              await save(); close(); setBackups(null); refresh();
            })}>项目首页</button>
            <button onClick={() => run(async () => {
              const json = await projectExport(project);
              await window.forge.exportFile({ name: namify(project.name, '.worldforge.json'), data: await readData(new Blob([json], { type: 'application/json' })) });
            })}>导出 JSON</button>
            <button onClick={() => run(async () => {
              await save(); setBackups(await window.forge.backups());
            })}>备份恢复</button>
          </div>
        </nav>
        {screen === '地图' && map && <MapEditor key={dir + map.id} project={project} map={map} selectMap={openMap} openCharacter={openCharacter} />}
        {screen === '人物' && <Characters project={project} id={characterId} select={setCharacterId} locate={openMap} />}
        {screen === '关系图' && <Relations project={project} openCharacter={openCharacter} />}
      </div>
      {backups && <div className="overlay" onClick={() => setBackups(null)}>
        <section className="dialog" role="dialog" aria-modal="true" aria-label="备份恢复" onClick={event => event.stopPropagation()}>
          <div className="panel-title"><h2>项目备份</h2><button onClick={() => setBackups(null)}>关闭</button></div>
          {backups.length ? <p>恢复会替换当前内容，并先为当前版本保留一份备份。</p> : <p>项目编辑并保存后会生成备份。</p>}
          {backups.map(item => <div className="backup-row" key={item.file}><span>{new Date(item.date).toLocaleString()}</span>
            <button disabled={busy} onClick={() => {
              if (confirm('恢复到这份备份？')) changeProject(() => window.forge.restore(item.file));
            }}>恢复</button></div>)}
        </section>
      </div>}
    </>}
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
