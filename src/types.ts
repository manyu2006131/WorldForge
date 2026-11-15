export type ShapeKind = 'brush' | 'rect' | 'text' | 'pin' | 'line' | 'circle' | 'polygon';

export interface Shape {
  id: string;
  type: ShapeKind;
  x: number;
  y: number;
  points?: number[];
  width?: number;
  height?: number;
  text?: string;
  color: string;
  stroke: number;
  opacity: number;
  layerId?: string;
  characterIds?: string[];
  notes?: string;
  submapId?: string;
}

export interface MapLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface MapData {
  id: string;
  name: string;
  parentId?: string;
  width: number;
  height: number;
  background: string | null;
  backgroundOpacity: number;
  backgroundScale: number;
  backgroundX: number;
  backgroundY: number;
  layers: MapLayer[];
  shapes: Shape[];
}

export interface Character {
  id: string;
  name: string;
  alias: string;
  gender: string;
  age: string;
  job: string;
  faction: string;
  appearance: string;
  personality: string;
  motivation: string;
  secret: string;
  backstory: string;
  notes: string;
  intro: string;
  tags: string;
  images: string[];
  graphX?: number;
  graphY?: number;
}

export interface Relation {
  id: string;
  from: string;
  to: string;
  name: string;
  color: string;
}

export interface Project {
  version: number;
  name: string;
  maps: MapData[];
  characters: Character[];
  relations: Relation[];
}

export interface OpenedProject { dir: string; data: Project; }
export interface RecentProject { dir: string; name: string; }
export interface Backup { file: string; date: string; }
export type AssetTable = Record<string, string>;

export interface Forge {
  mobile?: boolean;
  create: (data: Project, assets?: AssetTable) => Promise<OpenedProject | null>;
  open: () => Promise<OpenedProject | null>;
  openPath: (dir: string) => Promise<OpenedProject>;
  recent: () => Promise<RecentProject[]>;
  save: (data: Project) => Promise<boolean>;
  assetData: (name: string) => Promise<string>;
  writeAsset: (file: { name: string; data: string }) => Promise<string>;
  exportFile: (file: { name: string; data: string }) => Promise<boolean>;
  backups: () => Promise<Backup[]>;
  restore: (file: string) => Promise<OpenedProject>;
  onFlush: (callback: (close: boolean) => void) => void;
  closeReady: () => void;
}

declare global { interface Window { forge: Forge; } }
