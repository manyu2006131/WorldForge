import { useEffect, useRef, useState } from 'react';
import { Image as KImage } from 'react-konva';

export function useImage(name: string | null, dir: string) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => {
    let active = true;
    setImage(undefined);
    if (name) window.forge.assetData(name).then(url => {
      const img = new Image();
      img.onload = () => { if (active) setImage(img); };
      img.src = url;
    }).catch(console.error);
    return () => { active = false; };
  }, [name, dir]);
  return image;
}

export function CanvasImage({ name, dir, ...props }: { name: string; dir: string } & Omit<React.ComponentProps<typeof KImage>, 'image'>) {
  const image = useImage(name, dir);
  return image ? <KImage image={image} {...props} /> : null;
}

export function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, set] = useState({ width: 1, height: 1 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      set({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

export function useSpace() {
  const [space, setSpace] = useState(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || (event.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable]')) return;
      event.preventDefault();
      setSpace(true);
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpace(false); };
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return space;
}

export const fitView = (viewport: { width: number; height: number }, width: number, height: number) => {
  const scale = Math.max(.002, Math.min((viewport.width - 28) / width, (viewport.height - 28) / height, 2));
  return { x: (viewport.width - width * scale) / 2, y: (viewport.height - height * scale) / 2, scale };
};

export function useViewport() {
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const zoom = (x: number, y: number, factor: number) => setView(old => {
    const scale = Math.max(.002, Math.min(8, old.scale * factor));
    return { scale, x: x - (x - old.x) * scale / old.scale, y: y - (y - old.y) * scale / old.scale };
  });
  return { view, setView, zoom };
}
