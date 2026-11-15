import type { AssetTable, Character, MapData, Project } from './types';

export function uid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
}

export function blankMap(name = '世界地图', parentId?: string): MapData {
  return {
    id: uid(), name, parentId, width: 4096, height: 4096, background: null,
    backgroundOpacity: 0.6, backgroundScale: 1, backgroundX: 0, backgroundY: 0,
    shapes: [], layers: [{ id: 'base', name: '标注', visible: true, locked: false }],
  };
}

export function blankProject(): Project {
  return { version: 2, name: '未命名世界', maps: [blankMap()], characters: [], relations: [] };
}

export function blankCharacter(): Character {
  return {
    id: uid(), name: '新角色', alias: '', gender: '', age: '', job: '', faction: '',
    appearance: '', personality: '', motivation: '', secret: '', backstory: '',
    notes: '', intro: '', tags: '', images: [],
  };
}

export function normalize(data: Project): Project {
  if (!data || ![1, 2].includes(data.version) || typeof data.name !== 'string' ||
      !Array.isArray(data.maps) || !data.maps.length || !Array.isArray(data.characters) ||
      !Array.isArray(data.relations)) throw Error('无法识别这个 WorldForge 项目。');
  const next = structuredClone(data);
  next.version = 2;
  for (const map of next.maps) {
    if (!map || typeof map.id !== 'string' || typeof map.name !== 'string' ||
        !Number.isFinite(map.width) || !Number.isFinite(map.height) ||
        map.width < 1 || map.height < 1 || !Array.isArray(map.shapes)) throw Error('地图数据不完整。');
    if (!map.layers?.length) map.layers = blankMap().layers;
    const layerIds = new Set(map.layers.map(layer => layer.id));
    for (const shape of map.shapes) {
      if (!shape || typeof shape.id !== 'string') throw Error('地图标注无效。');
      if (!shape.layerId || !layerIds.has(shape.layerId)) shape.layerId = map.layers[0].id;
    }
  }
  if (next.characters.some(character => !character || typeof character.id !== 'string' ||
    typeof character.name !== 'string' || !Array.isArray(character.images))) throw Error('人物数据无效。');
  const ids = new Set(next.characters.map(character => character.id));
  next.relations = next.relations.filter(relation => relation && ids.has(relation.from) && ids.has(relation.to));
  return next;
}

export function assetNames(project: Project) {
  return [...new Set([
    ...project.maps.flatMap(map => map.background ? [map.background] : []),
    ...project.characters.flatMap(character => character.images),
  ])];
}

export async function projectExport(project: Project) {
  const assets = Object.fromEntries(await Promise.all(assetNames(project).map(async name =>
    [name, await window.forge.assetData(name)])));
  return JSON.stringify({ format: 'worldforge', project, assets }, null, 2);
}

export function projectImport(text: string): { project: Project; assets: AssetTable } {
  const payload = JSON.parse(text);
  const project = normalize(payload?.format === 'worldforge' ? payload.project : payload);
  const assets: AssetTable = {};
  for (const name of assetNames(project)) {
    const data = payload.assets?.[name];
    if (!/^[a-f0-9]{64}\.(png|jpe?g|webp|gif)$/.test(name) ||
        typeof data !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(data)) {
      throw Error('项目缺少图片。请从世界工坊导出完整的项目 JSON，或打开原项目文件夹。');
    }
    assets[name] = data;
  }
  return { project, assets };
}

export function demoProject(): Project {
  const project = blankProject();
  project.name = '雾港纪事';
  const world = project.maps[0];
  world.name = '北境群岛';
  world.width = 1200;
  world.height = 800;
  const port = blankMap('雾港', world.id);
  port.width = 1000;
  port.height = 680;
  const mira = { ...blankCharacter(), name: '米拉', faction: '港务所', job: '制图师', intro: '为每一条海路留下一盏灯。' };
  const rowan = { ...blankCharacter(), name: '罗恩', faction: '北境航团', job: '领航员', intro: '熟悉潮汐，却记不清自己的故乡。' };
  project.maps.push(port);
  project.characters.push(mira, rowan);
  project.relations.push({ id: uid(), from: mira.id, to: rowan.id, name: '航海搭档', color: '#e2a976' });
  const base = { layerId: 'base', opacity: 1, stroke: 6, color: '#524a69' };
  world.shapes.push(
    { ...base, id: uid(), type: 'polygon', x: 250, y: 230, points: [0, 40, 225, -95, 510, 0, 565, 240, 350, 345, 90, 260] },
    { ...base, id: uid(), type: 'brush', x: 610, y: 450, points: [0, 0, 160, 30, 270, 130, 380, 110], color: '#438795' },
    { ...base, id: uid(), type: 'pin', x: 610, y: 450, text: '雾港', color: '#a14e38', submapId: port.id, characterIds: [mira.id, rowan.id] },
  );
  port.shapes.push(
    { ...base, id: uid(), type: 'rect', x: 180, y: 200, width: 310, height: 210 },
    { ...base, id: uid(), type: 'pin', x: 310, y: 295, text: '港务所', characterIds: [mira.id], notes: '第一个可调查的地点。' },
  );
  return project;
}

export function namify(name: string, extension: string) {
  return (name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 100) || 'WorldForge') + extension;
}
