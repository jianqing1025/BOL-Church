import { memo, useEffect, useRef, useState } from 'react';
import type { SlideSpec } from '../shared/model';
import { drawSlide } from '../shared/render';

/**
 * A slide's thumbnail, drawn by the same code as the screen. Drawn only once it
 * scrolls into view, a few at a time, so a 200-page deck never stalls the panel.
 */

const THUMB_W = 384;
const THUMB_H = 216;

const queue: (() => Promise<void>)[] = [];
let running = 0;

function enqueue(job: () => Promise<void>) {
  queue.push(job);
  pump();
}

function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift()!;
    running++;
    void job().finally(() => { running--; pump(); });
  }
}

export const Thumb = memo(function Thumb({ spec, large = false }: { spec: SlideSpec; large?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(spec);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    enqueue(async () => {
      const el = canvas.current;
      if (cancelled || !el) return;
      try {
        el.getContext('2d')!.clearRect(0, 0, el.width, el.height);
        await drawSlide(el, spec, { thumbnail: true });
        if (!cancelled) setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, key]);

  return (
    <div className="thumb-canvas">
      <canvas ref={canvas} width={large ? 960 : THUMB_W} height={large ? 540 : THUMB_H} />
      {error && <div className="thumb-error" title={error}>{error}</div>}
    </div>
  );
});
