import { useEffect, useState } from 'react';
import { Stage, Layer, Group, Rect, Text, Line, Circle } from 'react-konva';
import { CanvasImage, useSize, useSpace, useViewport } from './canvas';
import { uid } from './project';
import { useStore } from './store';
import type { Character, Project } from './types';

export function Relations({ project, openCharacter }: { project: Project; openCharacter: (id: string) => void }) {
  const { edit, dir } = useStore();
  const { ref, size } = useSize();
  const { view, zoom, setView } = useViewport();
  const [pan, setPan] = useState(false);
  const panning = useSpace() || pan;
  const [panel, setPanel] = useState(false);
  const [focus, setFocus] = useState('');
  const [selection, setSelection] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [name, setName] = useState('朋友');
  const [color, setColor] = useState('#dfa976');
  const selected = project.relations.find(item => item.id === selection);
  const characters = project.characters;
  const focused = characters.find(item => item.id === focus);
  const relations = focused ? project.relations.filter(item => item.from === focus || item.to === focus) : project.relations;
  const related = new Set(relations.flatMap(item => [item.from, item.to]));
  const nodes = focused ? characters.filter(item => item.id === focus || related.has(item.id)) : characters;
  const position = (character: Character) => {
    const i = characters.indexOf(character);
    return { x: character.graphX ?? 110 + i % 4 * 185, y: character.graphY ?? 90 + Math.floor(i / 4) * 125 };
  };
  const positions = new Map(characters.map(item => [item.id, position(item)]));

  function frame(points = nodes.map(position)) {
    if (!points.length) return;
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    const minX = Math.min(...xs) - 85, maxX = Math.max(...xs) + 85;
    const minY = Math.min(...ys) - 55, maxY = Math.max(...ys) + 55;
    const scale = Math.max(.015, Math.min(1.4, size.width / (maxX - minX), size.height / (maxY - minY)));
    setView({ scale, x: size.width / 2 - (minX + maxX) * scale / 2, y: size.height / 2 - (minY + maxY) * scale / 2 });
  }

  function autoLayout() {
    const ordered = [...characters].sort((a, b) => a.faction.localeCompare(b.faction, 'zh') || a.name.localeCompare(b.name, 'zh'));
    const radius = ordered.length === 1 ? 0 : Math.max(130, ordered.length * 34);
    const layout = new Map(ordered.map((item, i) => {
      const angle = i * Math.PI * 2 / ordered.length - Math.PI / 2;
      return [item.id, { x: 100 + radius + Math.cos(angle) * radius, y: 100 + radius + Math.sin(angle) * radius }] as const;
    }));
    edit(value => {
      for (const character of value.characters) {
        const point = layout.get(character.id);
        if (point) { character.graphX = point.x; character.graphY = point.y; }
      }
    });
    frame(nodes.map(item => layout.get(item.id)!));
  }

  function remove() {
    edit(value => { value.relations = value.relations.filter(item => item.id !== selection); });
    setSelection('');
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Delete' && selected && !(event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) remove();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  function selectFocus(id: string) {
    setFocus(id);
    const ids = new Set(project.relations.filter(item => item.from === id || item.to === id).flatMap(item => [item.from, item.to]));
    frame(characters.filter(item => !id || item.id === id || ids.has(item.id)).map(position));
  }

  return <>
    <main className="workspace">
      <div className="canvasbar"><h2>人物关系图</h2><div className="inline">
        <button onClick={autoLayout} disabled={!characters.length}>自动布局</button>
        <button onClick={() => frame()}>全图</button>
        <button onClick={() => zoom(size.width / 2, size.height / 2, 1.25)}>＋</button>
        <button onClick={() => zoom(size.width / 2, size.height / 2, .8)}>−</button>
        <button className={pan ? 'on' : ''} onClick={() => setPan(!pan)}>平移</button>
        <button className="mobile-only" onClick={() => setPanel(open => !open)}>设置</button>
      </div></div>
      <div ref={ref} className="canvas relation-canvas">
        <Stage {...size} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} draggable={panning}
          onDragEnd={event => {
            if (event.target === event.target.getStage()) setView(old => ({ ...old, x: event.target.x(), y: event.target.y() }));
          }} onWheel={event => {
            event.evt.preventDefault();
            const point = event.target.getStage()?.getPointerPosition();
            if (point) zoom(point.x, point.y, event.evt.deltaY < 0 ? 1.12 : 1 / 1.12);
          }}>
          <Layer>
            {relations.map((item, index) => {
              const a = positions.get(item.from), b = positions.get(item.to);
              if (!a || !b) return null;
              const peers = relations.filter(other =>
                (other.from === item.from && other.to === item.to) || (other.from === item.to && other.to === item.from));
              const displacement = (peers.indexOf(item) - (peers.length - 1) / 2) * 28;
              const offset = item.from < item.to ? displacement : -displacement;
              const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
              const x = (a.x + b.x) / 2 - (b.y - a.y) / length * offset;
              const y = (a.y + b.y) / 2 + (b.x - a.x) / length * offset;
              const active = item.id === selection;
              const choose = () => { if (!panning) { setSelection(item.id); setPanel(true); } };
              return <Group key={item.id || index} onClick={choose} onTap={choose}>
                <Line points={[a.x, a.y, x, y, b.x, b.y]} tension={.35} stroke={active ? '#fff3d9' : item.color}
                  strokeWidth={active ? 4 : 2} hitStrokeWidth={20} />
                <Text x={x - 65} y={y - 18} width={130} align="center" text={item.name} fill={item.color} fontSize={16} />
              </Group>;
            })}
            {nodes.map(item => <Group {...position(item)} key={item.id} draggable={!panning}
              onDblClick={() => { if (!panning) openCharacter(item.id); }}
              onDblTap={() => { if (!panning) openCharacter(item.id); }}
              onDragEnd={event => {
                const x = event.target.x(), y = event.target.y();
                edit(value => {
                  const character = value.characters.find(entry => entry.id === item.id);
                  if (character) { character.graphX = x; character.graphY = y; }
                });
              }}>
              <Rect x={-72} y={-32} width={144} height={64} cornerRadius={12} fill="#29263e"
                stroke={item.id === focus ? '#edb17a' : '#746c8b'} />
              <Circle x={-44} radius={17} fill="#a97265" />
              {item.images[0] && <CanvasImage name={item.images[0]} dir={dir} x={-61} y={-17} width={34} height={34} />}
              <Text x={-18} y={-15} width={82} height={20} ellipsis wrap="none" text={item.name} fill="#fff7ec" fontSize={14} />
              <Text x={-18} y={6} width={82} height={16} ellipsis wrap="none" text={item.faction} fill="#b9a9c9" fontSize={11} />
            </Group>)}
          </Layer>
        </Stage>
        {!characters.length && <div className="hint">先在人物档案中创建角色。</div>}
      </div>
    </main>
    <aside className={'properties ' + (panel ? 'drawer-open' : '')}>
      <div className="panel-title"><h3>关系设置</h3><button className="mobile-only" onClick={() => setPanel(false)}>收起</button></div>
      <label>聚焦人物<select value={focused?.id ?? ''} onChange={event => selectFocus(event.target.value)}>
        <option value="">显示全部</option>{characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      {focused && <button onClick={() => openCharacter(focus)}>打开人物档案</button>}
      <hr />
      <h3>建立关系</h3>
      {([[from, setFrom, '角色 A'], [to, setTo, '角色 B']] as const).map(([value, set, label]) => <label key={label}>{label}
        <select value={value} onChange={event => set(event.target.value)}><option value="">选择角色</option>
          {characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>)}
      <label>关系名称<input value={name} onChange={event => setName(event.target.value)} /></label>
      <label>连线颜色<input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
      <button className="primary" disabled={!positions.has(from) || !positions.has(to) || from === to || !name.trim()} onClick={() => {
        const id = uid(); edit(value => value.relations.push({ id, from, to, name: name.trim(), color })); setSelection(id);
      }}>＋ 创建关系</button>
      <hr />
      <h3>已有关系</h3>
      {relations.map(item => <button className={'relation-item ' + (item.id === selection ? 'on' : '')} key={item.id}
        onClick={() => setSelection(item.id)}>{characters.find(entry => entry.id === item.from)?.name} · {item.name} · {characters.find(entry => entry.id === item.to)?.name}</button>)}
      {selected && <>
        <label>编辑关系<input value={selected.name} onChange={event => {
          const name = event.target.value;
          edit(value => { value.relations.find(item => item.id === selection)!.name = name; });
        }} /></label>
        <button className="danger" onClick={remove}>删除选中关系</button>
      </>}
    </aside>
  </>;
}
