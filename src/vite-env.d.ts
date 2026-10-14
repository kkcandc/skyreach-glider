/// <reference types="vite/client" />

interface SkyDebugState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mode: 'title' | 'walk' | 'glide' | 'pause';
  grounded: boolean;
  speed: number;
  heading: number;
  pitch: number;
  bank: number;
  motes: number;
  moteTotal: number;
  landmarks: number;
  place: string;
  alt: number;
  gliding: boolean;
  airSpeed?: number;
  fov?: number;
  lift?: boolean;
}

interface SkyDebugApi {
  getState: () => SkyDebugState;
  setPos: (x: number, y: number, z: number) => void;
  deploy: () => void;
  stow: () => void;
  setTime: (t: number) => void;
  collectNear: () => number;
}

declare global {
  interface Window {
    __SKY?: SkyDebugApi;
  }
}

export {};
