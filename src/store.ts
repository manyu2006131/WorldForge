import {create} from 'zustand';import type {Project} from './types';
type State={project:Project|null;dir:string;revision:number;setProject:(p:Project,d:string)=>void;edit:(f:(p:Project)=>void)=>void};
export const useStore=create<State>((set)=>({project:null,dir:'',revision:0,setProject:(project,dir)=>set({project,dir,revision:0}),edit:(fn)=>set(s=>{if(!s.project)return s;const p=structuredClone(s.project);fn(p);return {project:p,revision:s.revision+1}})}));
export const uid=()=>crypto.randomUUID();
