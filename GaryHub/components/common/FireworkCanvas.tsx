
import React, { useEffect, useRef } from 'react';
import { soundService } from '../../services/soundService';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  hue: number;
  color: string;
  slowdown: number;
  gravity: number;
}

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  exploded: boolean;
  targetY: number;
  trail: {x: number, y: number}[];
}

interface FireworkCanvasProps {
  onInteraction?: () => void;
}

const FireworkCanvas: React.FC<FireworkCanvasProps> = ({ onInteraction }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const rocketsRef = useRef<Rocket[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  
  const createExplosion = (x: number, y: number, hue: number) => {
    soundService.playExplosion();

    const particleCount = 100 + Math.floor(Math.random() * 50); 
    
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      const hueVar = Math.floor(hue + Math.random() * 40 - 20);
      const brightness = Math.floor(50 + Math.random() * 20);
      
      particlesRef.current.push({
        x,
        y,
        vx,
        vy,
        alpha: 1,
        hue: hueVar,
        color: `hsl(${hueVar}, 100%, ${brightness}%)`,
        slowdown: 0.96,
        gravity: 0.05
      });
    }
  };

  const launchRocket = (targetX: number, targetY: number, canvasHeight: number) => {
    soundService.ensureContext();
    soundService.playLaunch();
    
    const startX = targetX + (Math.random() * 40 - 20);
    const startY = canvasHeight;
    
    const height = startY - targetY;
    const vy = -Math.sqrt(height * 2 * 0.015) - (Math.random() * 2);
    const vx = (targetX - startX) / (Math.abs(vy) / 0.015);

    rocketsRef.current.push({
      x: startX,
      y: startY,
      vx,
      vy,
      hue: Math.floor(Math.random() * 360),
      exploded: false,
      targetY: targetY,
      trail: []
    });
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.globalCompositeOperation = 'lighter';

    for (let i = rocketsRef.current.length - 1; i >= 0; i--) {
      const r = rocketsRef.current[i];
      
      r.x += r.vx;
      r.y += r.vy;
      r.vy += 0.015;

      ctx.beginPath();
      ctx.moveTo(r.x - r.vx * 3, r.y - r.vy * 3);
      ctx.lineTo(r.x, r.y);
      ctx.strokeStyle = `hsl(${r.hue}, 100%, 60%)`;
      ctx.lineWidth = 3;
      ctx.stroke();

      if (r.vy >= -0.5 || r.y <= r.targetY) {
        createExplosion(r.x, r.y, r.hue);
        rocketsRef.current.splice(i, 1);
      }
    }

    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      
      p.vx *= p.slowdown;
      p.vy *= p.slowdown;
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.005;

      if (p.alpha <= 0) {
        particlesRef.current.splice(i, 1);
        continue;
      }

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }
    
    ctx.globalAlpha = 1.0;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use ResizeObserver to detect size changes of the canvas container
    // This allows the canvas to adapt when switching from Full Screen to Split Screen (50vh)
    const resizeObserver = new ResizeObserver(() => {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    });
    
    resizeObserver.observe(canvas);

    // Initial sizing
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      resizeObserver.disconnect();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (onInteraction) onInteraction();

    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    launchRocket(x, y, canvas.height);
    
    if (Math.random() > 0.7) {
        setTimeout(() => launchRocket(x + (Math.random() * 60 - 30), y + (Math.random() * 60 - 30), canvas.height), 100);
    }
  };

  return (
    <div className="absolute inset-0 z-0 w-full h-full">
      <div className="absolute inset-0 z-0 bg-transparent pointer-events-none" />
      <canvas
        ref={canvasRef}
        onMouseDown={handleClick}
        className="block w-full h-full cursor-crosshair relative z-10"
      />
    </div>
  );
};

export default FireworkCanvas;
