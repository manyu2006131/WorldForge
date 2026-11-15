import { create } from 'zustand';
import type { OpenedProject, Project } from './types';
import { normalize } from './project';

interface State {
  project: Project | null;
  dir: string;
  revision: number;
  undoStack: Project[];
  redoStack: Project[];
  open: (result: OpenedProject) => void;
  close: () => void;
  edit: (fn: (project: Project) => void) => void;
  undo: () => void;
  redo: () => void;
}

const LIMIT = 50;
export const useStore = create<State>((set) => ({
  project: null, dir: '', revision: 0, undoStack: [], redoStack: [],
  open: ({ data, dir }) => set({ project: normalize(data), dir, revision: 0, undoStack: [], redoStack: [] }),
  close: () => set({ project: null, dir: '', revision: 0, undoStack: [], redoStack: [] }),
  edit: (fn) => set(state => {
    if (!state.project) return state;
    const project = structuredClone(state.project);
    fn(project);
    return {
      project, revision: state.revision + 1, redoStack: [],
      undoStack: [...state.undoStack.slice(1 - LIMIT), state.project],
    };
  }),
  undo: () => set(state => {
    const project = state.undoStack.at(-1);
    if (!project || !state.project) return state;
    return { project, revision: state.revision + 1, undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, state.project] };
  }),
  redo: () => set(state => {
    const project = state.redoStack.at(-1);
    if (!project || !state.project) return state;
    return { project, revision: state.revision + 1, redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, state.project] };
  }),
}));
