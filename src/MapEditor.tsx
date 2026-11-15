import { useEffect, useRef, useState } from 'react';
import Konva from 'konva';
import { Stage, Layer, Group, Rect, Line, Circle, Text } from 'react-konva';
import type { MapData, Project, Shape, ShapeKind } from './types';
import { blankMap, namify, uid } from './project';
import { CanvasImage, fitView, useSize, useSpace, useViewport } from './canvas';
import { importImage, report } from './files';
import { useStore } from './store';

type Tool = ShapeKind | 'select' | 'pan';
type Mouse = Konva.KonvaEventObject<MouseEvent | TouchEvent>;
const tools: [Tool, string][] = [
  ['select', '选择'], ['pan', '平移'], ['brush', '画笔'], ['line', '直线'], ['rect', '矩形'],
  ['circle', '圆形'], ['polygon', '多边形'], ['text', '文字'], ['pin', '图钉'],
];

function ShapeView({ shape, active, size, ...props }: {
  shape: Shape; active: boolean; size: number;
} & React.ComponentProps<typeof Group>) {
  const stroke = { stroke: shape.color, strokeWidth: shape.stroke, hitStrokeWidth: Math.max(shape.stroke, size / 2) };
  return <Group x={shape.x} y={shape.y} opacity={shape.opacity} {...props}>
    {shape.type === 'rect' ? <Rect width={shape.width} height={shape.height} {...stroke} />
      : shape.type === 'circle' ? <Circle radius={shape.width || 0} {...stroke} />
      : shape.type === 'text' ? <Text text={shape.text} fill={shape.color} fontSize={size} />
      : shape.type === 'pin' ? <><Circle radius={size * .34} fill={shape.color} stroke="#fff4df" strokeWidth={size * .07} />
        <Text x={size * .5} y={-size * .45} text={shape.text} fill={shape.color} fontSize={size * .86} /></>
      : <Line points={shape.points || []} closed={shape.type === 'polygon'} {...stroke} lineCap="round" lineJoin="round" />}
    {active && <Circle radius={size * .22} fill="#fff4df" stroke="#2a2241" strokeWidth={size * .06} listening={false} />}
  </Group>;
}

export function MapEditor({ project, map, selectMap, openCharacter }: {
  project: Project; map: MapData; selectMap: (id: string) => void; openCharacter: (id: string) => void;
}) {
  const { edit, dir } = useStore();
  const { ref, size } = useSize();
  const { view, setView, zoom } = useViewport();
  const space = useSpace();
  const stage = useRef<Konva.Stage>(null);
  const content = useRef<Konva.Group>(null);
  const ready = useRef(false);
  const [tool, setTool] = useState<Tool>('brush');
  const [layerId, setLayerId] = useState(map.layers[0].id);
  const [selectedId, setSelectedId] = useState('');
  const [color, setColor] = useState('#704c7a');
  const [stroke, setStroke] = useState(8);
  const [opacity, setOpacity] = useState(1);
  const [draft, setDraft] = useState<Shape | null>(null);
  const currentDraft = useRef<Shape | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activeLayer = map.layers.find(layer => layer.id === layerId) ?? map.layers[0];
  const selected = map.shapes.find(shape => shape.id === selectedId);
  const selectedLayer = map.layers.find(layer => layer.id === selected?.layerId);
  const editable = selected && selectedLayer?.visible && !selectedLayer.locked;
  const bounds = Math.max(map.width, map.height);
  const labelSize = Math.max(20, bounds / 100);
  const panning = space || tool === 'pan';

  const update = (fn: (value: MapData) => void) => edit(value => {
    const current = value.maps.find(item => item.id === map.id);
    if (current) fn(current);
  });

  function updateShape(id: string, change: Partial<Shape>) {
    update(value => {
      const shape = value.shapes.find(item => item.id === id);
      if (shape) Object.assign(shape, change);
    });
  }

  function setPreview(value: Shape | null) {
    currentDraft.current = value;
    setDraft(value);
  }

  function fit() { setView(fitView(size, map.width, map.height)); }
  useEffect(() => {
    if (!ready.current && size.width > 40 && size.height > 40) {
      fit();
      ready.current = true;
    }
  }, [size, map.width, map.height]);

  function removeSelected() {
    if (editable) {
      update(value => { value.shapes = value.shapes.filter(shape => shape.id !== selectedId); });
      setSelectedId('');
    }
  }

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
      if (event.key === 'Delete' && editable) { event.preventDefault(); removeSelected(); }
      if (event.key === 'Escape') { setPreview(null); setSelectedId(''); }
      if (event.key === 'Enter' && tool === 'polygon' && currentDraft.current) finishPolygon();
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });

  function start(event: Mouse) {
    if (panning || ('button' in event.evt && event.evt.button !== 0)) return;
    if (tool === 'select') { setSelectedId(''); return; }
    if (activeLayer.locked || !activeLayer.visible) return;
    const point = content.current?.getRelativePointerPosition();
    if (!point || point.x < 0 || point.y < 0 || point.x > map.width || point.y > map.height) return;
    const shape: Shape = { ...point, id: uid(), type: tool, color, stroke, opacity, layerId: activeLayer.id };
    if (tool === 'text' || tool === 'pin') {
      shape.text = tool === 'text' ? '文字标注' : '新地点';
      update(value => value.shapes.push(shape));
      setSelectedId(shape.id);
      setTool('select');
      setSettingsOpen(true);
    } else if (tool === 'polygon') {
      const previous = currentDraft.current;
      if (previous) setPreview({ ...previous, points: [...previous.points!, point.x - previous.x, point.y - previous.y] });
      else setPreview({ ...shape, points: [0, 0] });
    } else setPreview({ ...shape, points: [0, 0], width: 0, height: 0 });
  }

  function move() {
    const shape = currentDraft.current;
    const point = content.current?.getRelativePointerPosition();
    if (!shape || !point || shape.type === 'polygon') return;
    const dx = point.x - shape.x, dy = point.y - shape.y;
    if (shape.type === 'brush') setPreview({ ...shape, points: [...shape.points!, dx, dy] });
    else if (shape.type === 'line') setPreview({ ...shape, points: [0, 0, dx, dy] });
    else if (shape.type === 'circle') setPreview({ ...shape, width: Math.hypot(dx, dy) });
    else setPreview({ ...shape, width: dx, height: dy });
  }

  function finish() {
    const shape = currentDraft.current;
    if (!shape || shape.type === 'polygon') return;
    if ((shape.points?.length ?? 0) > 2 || shape.width || shape.height) {
      if (shape.type === 'rect') {
        shape.x += Math.min(0, shape.width!);
        shape.y += Math.min(0, shape.height!);
        shape.width = Math.abs(shape.width!);
        shape.height = Math.abs(shape.height!);
      }
      update(value => value.shapes.push(shape));
    }
    setPreview(null);
  }

  function finishPolygon() {
    const shape = currentDraft.current;
    if (shape && (shape.points?.length ?? 0) >= 6) {
      update(value => value.shapes.push(shape));
      setPreview(null);
    }
  }

  async function exportPng() {
    const node = content.current;
    if (!node) return;
    const clean = node.clone({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    clean.find('.selection-ui').forEach(item => item.destroy());
    const ratio = Math.min(1, 4096 / Math.max(map.width, map.height));
    try {
      await window.forge.exportFile({
        name: namify(map.name, '.png'),
        data: clean.toDataURL({ x: 0, y: 0, width: map.width, height: map.height, pixelRatio: ratio }),
      });
    } finally { clean.destroy(); }
  }

  const parent = project.maps.find(item => item.id === map.parentId);
  const children = project.maps.filter(item => item.parentId === map.id);
  const childOptions = map.parentId ? [] : children;

  function addMap(submap: boolean) {
    const next = blankMap(submap ? '新子地图' : '新地图', submap ? map.id : undefined);
    edit(value => {
      value.maps.push(next);
      if (submap && selected?.type === 'pin' && editable) {
        const pin = value.maps.find(item => item.id === map.id)?.shapes.find(item => item.id === selected.id);
        if (pin) pin.submapId = next.id;
      }
    });
    selectMap(next.id);
  }

  function removeMap() {
    const ids = new Set([map.id, ...children.map(item => item.id)]);
    const next = parent ?? project.maps.find(item => !ids.has(item.id));
    if (!next || !confirm('删除这张地图及其子地图？')) return;
    edit(value => {
      value.maps = value.maps.filter(item => !ids.has(item.id));
      for (const entry of value.maps) for (const shape of entry.shapes) {
        if (shape.submapId && ids.has(shape.submapId)) delete shape.submapId;
      }
    });
    selectMap(next.id);
  }

  return <>
    <main className="workspace">
      <div className="canvasbar">
        <div className="canvas-title">
          {parent && <button onClick={() => selectMap(parent.id)}>‹ {parent.name}</button>}
          <h2>{map.name}</h2>
        </div>
        <div className="tools" aria-label="地图工具">
          {tools.map(([id, label]) => <button className={tool === id ? 'on' : ''} key={id} onClick={() => {
            setTool(id); setPreview(null);
          }}>{label}</button>)}
          {tool === 'polygon' && <button disabled={(draft?.points?.length ?? 0) < 6} onClick={finishPolygon}>闭合</button>}
        </div>
        <div className="inline">
          <button aria-label="缩小" onClick={() => zoom(size.width / 2, size.height / 2, .8)}>−</button>
          <button aria-label="放大" onClick={() => zoom(size.width / 2, size.height / 2, 1.25)}>＋</button>
          <button onClick={fit}>全图</button>
          <button className="mobile-only" onClick={() => setSettingsOpen(open => !open)}>设置</button>
        </div>
      </div>
      <div className="canvas" ref={ref}>
        <Stage ref={stage} {...size} draggable={panning} onMouseDown={start} onTouchStart={start}
          onMouseMove={move} onTouchMove={move} onMouseUp={finish} onTouchEnd={finish}
          onMouseLeave={finish} onTouchCancel={() => setPreview(null)}
          x={view.x} y={view.y} onDragEnd={event => {
            if (event.target === stage.current) setView(old => ({ ...old, x: event.target.x(), y: event.target.y() }));
          }} onWheel={event => {
            event.evt.preventDefault();
            const point = stage.current?.getPointerPosition();
            if (point) zoom(point.x, point.y, event.evt.deltaY < 0 ? 1.12 : 1 / 1.12);
          }}>
          <Layer>
            <Group ref={content} scaleX={view.scale} scaleY={view.scale} clipWidth={map.width} clipHeight={map.height}>
              <Rect name="paper" width={map.width} height={map.height} fill="#f4efe5" />
              {!map.background && <Group name="selection-ui" listening={false}>
                {Array.from({ length: 16 }, (_, i) => <Line key={'x' + i} points={[i * map.width / 16, 0, i * map.width / 16, map.height]} stroke="#dad4cf" strokeWidth={bounds / 1600} />)}
                {Array.from({ length: 16 }, (_, i) => <Line key={'y' + i} points={[0, i * map.height / 16, map.width, i * map.height / 16]} stroke="#dad4cf" strokeWidth={bounds / 1600} />)}
              </Group>}
              {map.background && <CanvasImage name={map.background} dir={dir} x={map.backgroundX} y={map.backgroundY}
                scaleX={map.backgroundScale} scaleY={map.backgroundScale} opacity={map.backgroundOpacity} listening={false} />}
              {map.layers.filter(layer => layer.visible).map(layer => <Group key={layer.id}>
                {map.shapes.filter(shape => shape.layerId === layer.id).map(shape => {
                  const canSelect = tool === 'select' && !panning;
                  const pick = () => { setSelectedId(shape.id); setLayerId(layer.id); };
                  return <ShapeView key={shape.id} shape={shape} size={labelSize} active={shape.id === selectedId}
                    listening={canSelect} draggable={canSelect && !layer.locked}
                    onMouseDown={event => { event.cancelBubble = true; pick(); }}
                    onTouchStart={event => { event.cancelBubble = true; pick(); }}
                    onDblClick={() => { if (shape.submapId) selectMap(shape.submapId); else setSettingsOpen(true); }}
                    onDblTap={() => { if (shape.submapId) selectMap(shape.submapId); else setSettingsOpen(true); }}
                    onDragEnd={event => updateShape(shape.id, { x: event.target.x(), y: event.target.y() })} />;
                })}
              </Group>)}
              {draft && <ShapeView name="selection-ui" shape={draft} active={false} size={labelSize} listening={false} />}
            </Group>
          </Layer>
        </Stage>
        {(activeLayer.locked || !activeLayer.visible) && <div className="hint">当前图层已锁定或隐藏</div>}
      </div>
    </main>
    <aside className={'properties ' + (settingsOpen ? 'drawer-open' : '')}>
      <div className="panel-title"><h3>地图设置</h3><button className="mobile-only" onClick={() => setSettingsOpen(false)}>收起</button></div>
      <label>地图<select value={map.id} onChange={event => selectMap(event.target.value)}>
        {project.maps.filter(item => !item.parentId).map(item => <optgroup key={item.id} label={item.name}>
          <option value={item.id}>{item.name}</option>
          {project.maps.filter(child => child.parentId === item.id).map(child => <option key={child.id} value={child.id}>↳ {child.name}</option>)}
        </optgroup>)}
      </select></label>
      <div className="inline"><button onClick={() => addMap(false)}>新地图</button>
        {!map.parentId && <button onClick={() => addMap(true)}>{selected?.type === 'pin' && editable ? '新建并绑定子地图' : '新子地图'}</button>}</div>
      <label>地图名称<input value={map.name} onChange={event => update(value => { value.name = event.target.value; })} /></label>
      <div className="row">{(['width', 'height'] as const).map((key, i) => <label key={key}>{i ? '高度' : '宽度'}
        <input type="number" min="1" max="32768" key={map[key]} defaultValue={map[key]} onBlur={event => {
          const n = Math.max(1, Math.min(32768, Math.floor(+event.target.value || map[key])));
          if (n !== map[key]) update(value => { value[key] = n; });
        }} /></label>)}</div>
      <div className="inline"><button onClick={() => exportPng().catch(report)}>导出 PNG</button>
        <button className="danger" disabled={!project.maps.some(item => item.id !== map.id && item.parentId !== map.id)} onClick={removeMap}>删除地图</button></div>
      <hr />
      <h3>底图</h3>
      <label className="file-button">导入底图<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) importImage(file).then(name => update(value => { value.background = name; })).catch(report);
      }} /></label>
      {map.background && <>
        {([['backgroundOpacity', '透明度', 0, 1, .05], ['backgroundScale', '缩放', .01, 100, .1],
          ['backgroundX', '横向偏移', -32768, 32768, 1], ['backgroundY', '纵向偏移', -32768, 32768, 1]] as const)
          .map(([key, label, min, max, step]) => <label key={key}>{label}<input type="number" min={min} max={max} step={step}
            defaultValue={map[key]} key={map[key]} onBlur={event => {
              const n = Math.max(min, Math.min(max, +event.target.value || 0));
              if (n !== map[key]) update(value => { value[key] = n; });
            }} /></label>)}
        <button onClick={() => update(value => { value.background = null; })}>移除底图</button>
      </>}
      <hr />
      <div className="panel-title"><h3>图层</h3><button onClick={() => {
        const id = uid(); update(value => value.layers.push({ id, name: '新图层', visible: true, locked: false })); setLayerId(id); setPreview(null);
      }}>＋</button></div>
      {[...map.layers].reverse().map(layer => <div className={'layer-row ' + (activeLayer.id === layer.id ? 'layer-active' : '')} key={layer.id}>
        <button onClick={() => { setLayerId(layer.id); setPreview(null); }}>{layer.name}</button>
        <button aria-label={layer.visible ? '隐藏图层' : '显示图层'} onClick={() => {
          setPreview(null); update(value => { value.layers.find(item => item.id === layer.id)!.visible = !layer.visible; });
        }}>{layer.visible ? '◉' : '○'}</button>
        <button aria-label={layer.locked ? '解锁图层' : '锁定图层'} onClick={() => {
          setPreview(null); update(value => { value.layers.find(item => item.id === layer.id)!.locked = !layer.locked; });
        }}>{layer.locked ? '锁' : '开'}</button>
      </div>)}
      <label>当前图层名称<input value={activeLayer.name} onChange={event => update(value => {
        value.layers.find(layer => layer.id === activeLayer.id)!.name = event.target.value;
      })} /></label>
      <div className="inline">{([1, -1] as const).map(delta => {
        const i = map.layers.indexOf(activeLayer), target = i + delta;
        return <button key={delta} disabled={target < 0 || target >= map.layers.length} onClick={() => update(value => {
          [value.layers[i], value.layers[target]] = [value.layers[target], value.layers[i]];
        })}>{delta > 0 ? '上移' : '下移'}</button>;
      })}<button disabled={map.layers.length < 2 || activeLayer.locked} onClick={() => {
        if (!confirm('删除图层及其中的标注？')) return;
        update(value => {
          value.layers = value.layers.filter(layer => layer.id !== activeLayer.id);
          value.shapes = value.shapes.filter(shape => shape.layerId !== activeLayer.id);
        });
        setPreview(null);
      }}>删除</button></div>
      <hr />
      <h3>{selected ? '选中标注' : '绘制样式'}</h3>
      <label>颜色<input type="color" disabled={!!selected && !editable} value={selected?.color ?? color}
        onChange={event => selected ? updateShape(selected.id, { color: event.target.value }) : setColor(event.target.value)} /></label>
      <label>粗细<input type="range" min="1" max="80" disabled={!!selected && !editable} value={selected?.stroke ?? stroke}
        onChange={event => selected ? updateShape(selected.id, { stroke: +event.target.value }) : setStroke(+event.target.value)} /></label>
      <label>透明度<input type="range" min=".05" max="1" step=".05" disabled={!!selected && !editable} value={selected?.opacity ?? opacity}
        onChange={event => selected ? updateShape(selected.id, { opacity: +event.target.value }) : setOpacity(+event.target.value)} /></label>
      {selected && <>
        {['text', 'pin'].includes(selected.type) && <label>名称<input disabled={!editable} value={selected.text ?? ''}
          onChange={event => updateShape(selected.id, { text: event.target.value })} /></label>}
        {selected.type === 'pin' && <>
          <label>地点笔记<textarea disabled={!editable} value={selected.notes ?? ''}
            onChange={event => updateShape(selected.id, { notes: event.target.value })} /></label>
          {!map.parentId && <label>关联子地图<select disabled={!editable} value={selected.submapId ?? ''}
            onChange={event => updateShape(selected.id, { submapId: event.target.value || undefined })}>
            <option value="">无</option>{childOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>}
          {selected.submapId && <button onClick={() => selectMap(selected.submapId!)}>进入子地图</button>}
          <h4>地点人物</h4>
          {project.characters.map(character => {
            const ids = selected.characterIds ?? [];
            return <div className="inline" key={character.id}><label className="check"><input type="checkbox" disabled={!editable}
              checked={ids.includes(character.id)} onChange={event => updateShape(selected.id, {
                characterIds: event.target.checked ? [...ids, character.id] : ids.filter(id => id !== character.id),
              })} />{character.name}</label>
              {ids.includes(character.id) && <button onClick={() => openCharacter(character.id)}>档案</button>}</div>;
          })}
        </>}
        <button className="danger" disabled={!editable} onClick={removeSelected}>删除选中</button>
      </>}
    </aside>
  </>;
}
