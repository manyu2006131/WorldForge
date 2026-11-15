import { useState } from 'react';
import { useImage } from './canvas';
import { importImage, report } from './files';
import { blankCharacter } from './project';
import { useStore } from './store';
import type { Character, Project } from './types';

const fields: [Exclude<keyof Character, 'id' | 'images' | 'graphX' | 'graphY'>, string, boolean?][] = [
  ['name', '姓名'], ['alias', '别名'], ['gender', '性别'], ['age', '年龄'], ['job', '身份 / 职业'],
  ['faction', '所属势力'], ['intro', '一句话简介'], ['tags', '标签'], ['appearance', '外貌描述', true],
  ['personality', '性格', true], ['motivation', '动机', true], ['secret', '秘密', true],
  ['backstory', '背景故事', true], ['notes', '备注', true],
];

function Portrait({ name, dir, fallback }: { name?: string; dir: string; fallback: string }) {
  const image = useImage(name ?? null, dir);
  return image ? <img src={image.src} alt="" /> : <span>{fallback}</span>;
}

export function Characters({ project, id, select, locate }: {
  project: Project; id: string; select: (id: string) => void; locate: (map: string) => void;
}) {
  const { edit, dir } = useStore();
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState(true);
  const character = project.characters.find(item => item.id === id);
  const matches = project.characters.filter(item =>
    [item.name, item.alias, item.tags, item.faction].some(value => value.toLowerCase().includes(search.toLowerCase().trim())));
  const update = (fn: (value: Character) => void) => edit(data => {
    const current = data.characters.find(item => item.id === id);
    if (current) fn(current);
  });

  return <div className={'people ' + (character && focus ? 'show-person' : '')}>
    <div className="people-list">
      <div className="heading"><h2>人物档案</h2><button className="primary" onClick={() => {
        const next = blankCharacter(); edit(data => data.characters.push(next)); select(next.id); setFocus(true);
      }}>＋ 新建</button></div>
      <input type="search" placeholder="搜索姓名、别名、标签或势力" value={search} onChange={event => setSearch(event.target.value)} />
      {matches.map(item => <button type="button" className={'person-card ' + (item.id === id ? 'selected' : '')}
        key={item.id} onClick={() => { select(item.id); setFocus(true); }}>
        <div className="avatar"><Portrait name={item.images[0]} dir={dir} fallback={item.name.slice(0, 1) || '?'} /></div>
        <div><strong>{item.name || '未命名'}</strong><small>{item.faction}</small><p>{item.intro}</p></div>
      </button>)}
      {!matches.length && <p className="muted">暂无匹配人物。</p>}
    </div>
    <div className="person-detail">{character ? <>
      <div className="heading">
        <button className="mobile-only" onClick={() => setFocus(false)}>‹ 人物列表</button>
        <h2>{character.name || '未命名人物'}</h2>
        <button className="danger" onClick={() => {
          const count = project.relations.filter(item => item.from === id || item.to === id).length;
          if (!confirm(`删除「${character.name}」？同时移除 ${count} 条人物关系和相关地点关联。`)) return;
          edit(data => {
            data.characters = data.characters.filter(item => item.id !== id);
            data.relations = data.relations.filter(item => item.from !== id && item.to !== id);
            for (const map of data.maps) for (const shape of map.shapes) {
              if (shape.characterIds) shape.characterIds = shape.characterIds.filter(value => value !== id);
            }
          });
          select('');
        }}>删除</button>
      </div>
      <div className="fields">{fields.map(([key, label, long]) => <label key={key}>{label}
        {long ? <textarea value={character[key]} onChange={event => update(value => { value[key] = event.target.value; })} />
          : <input value={character[key]} onChange={event => update(value => { value[key] = event.target.value; })} />}
      </label>)}</div>
      <h3>人物图片</h3>
      <div className="gallery">
        {character.images.map((name, i) => <div key={name + i}><Portrait name={name} dir={dir} fallback="图片" />
          {i === 0 ? <small>档案封面</small> : <button onClick={() => update(value => {
            value.images.unshift(value.images.splice(i, 1)[0]);
          })}>设为封面</button>}
          <button onClick={() => update(value => { value.images.splice(i, 1); })}>移除</button>
        </div>)}
        <label className="file-button">＋ 导入图片<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) importImage(file).then(name => update(value => {
            if (!value.images.includes(name)) value.images.push(name);
          })).catch(report);
        }} /></label>
      </div>
      <h3>关联地点</h3>
      <div className="inline">
        {project.maps.flatMap(map => map.shapes.filter(shape => shape.characterIds?.includes(id)).map(shape =>
          <button onClick={() => locate(map.id)} key={shape.id}>{map.name} · {shape.text}</button>))}
      </div>
    </> : <div className="empty">选择一个人物，或新建角色</div>}</div>
  </div>;
}
