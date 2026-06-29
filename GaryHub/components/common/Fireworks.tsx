
import React, { useEffect, useRef } from 'react';

const Fireworks = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; let w = canvas.width = window.innerWidth; let h = canvas.height = window.innerHeight; const loop = () => { requestAnimationFrame(loop); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }; loop(); }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[9999]" />;
};

export default Fireworks;
