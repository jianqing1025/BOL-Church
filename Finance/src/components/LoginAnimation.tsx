import { useEffect, useRef, useState } from 'react';

type EyeProps = {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
};

function Eye({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = 'white',
  pupilColor = '#172033',
  isBlinking = false,
  forceLookX,
  forceLookY
}: EyeProps) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const eyeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouse = (event: MouseEvent) => setMouse({ x: event.clientX, y: event.clientY });
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  const position = () => {
    if (!eyeRef.current) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) return { x: forceLookX, y: forceLookY };
    const rect = eyeRef.current.getBoundingClientRect();
    const dx = mouse.x - (rect.left + rect.width / 2);
    const dy = mouse.y - (rect.top + rect.height / 2);
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  };

  const pos = position();
  return (
    <div
      ref={eyeRef}
      style={{
        width: size,
        height: isBlinking ? 2 : size,
        borderRadius: '50%',
        backgroundColor: eyeColor,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'height 150ms ease'
      }}
    >
      {!isBlinking && (
        <div
          style={{
            width: pupilSize,
            height: pupilSize,
            borderRadius: '50%',
            backgroundColor: pupilColor,
            transform: `translate(${pos.x}px, ${pos.y}px)`,
            transition: 'transform 100ms ease-out'
          }}
        />
      )}
    </div>
  );
}

type PupilProps = {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
};

function Pupil({ size = 12, maxDistance = 5, pupilColor = '#172033', forceLookX, forceLookY }: PupilProps) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouse = (event: MouseEvent) => setMouse({ x: event.clientX, y: event.clientY });
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  const position = () => {
    if (!pupilRef.current) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) return { x: forceLookX, y: forceLookY };
    const rect = pupilRef.current.getBoundingClientRect();
    const dx = mouse.x - (rect.left + rect.width / 2);
    const dy = mouse.y - (rect.top + rect.height / 2);
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  };

  const pos = position();
  return (
    <div
      ref={pupilRef}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: pupilColor,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: 'transform 100ms ease-out'
      }}
    />
  );
}

export function LoginAnimation({
  isTyping = false,
  passwordLength = 0
}: {
  isTyping?: boolean;
  passwordLength?: number;
}) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [redBlinking, setRedBlinking] = useState(false);
  const [tealBlinking, setTealBlinking] = useState(false);
  const [lookingAtEachOther, setLookingAtEachOther] = useState(false);

  const redRef = useRef<HTMLDivElement>(null);
  const tealRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const pinkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouse = (event: MouseEvent) => setMouse({ x: event.clientX, y: event.clientY });
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setRedBlinking(true);
        setTimeout(() => {
          setRedBlinking(false);
          schedule();
        }, 150);
      }, Math.random() * 4000 + 3000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setTealBlinking(true);
        setTimeout(() => {
          setTealBlinking(false);
          schedule();
        }, 150);
      }, Math.random() * 4000 + 3000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isTyping) {
      setLookingAtEachOther(false);
      return;
    }
    setLookingAtEachOther(true);
    const timer = setTimeout(() => setLookingAtEachOther(false), 800);
    return () => clearTimeout(timer);
  }, [isTyping]);

  const calcPosition = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 3;
    const dx = mouse.x - cx;
    const dy = mouse.y - cy;
    return {
      faceX: Math.max(-15, Math.min(15, dx / 20)),
      faceY: Math.max(-10, Math.min(10, dy / 30)),
      bodySkew: Math.max(-6, Math.min(6, -dx / 120))
    };
  };

  const red = calcPosition(redRef);
  const teal = calcPosition(tealRef);
  const yellow = calcPosition(yellowRef);
  const pink = calcPosition(pinkRef);
  const hiding = passwordLength > 0;

  return (
    <div className="login-animation-scene" aria-hidden="true">
      <div
        ref={redRef}
        className="login-shape login-shape-red"
        style={{
          height: isTyping || hiding ? 440 : 400,
          transform: isTyping || hiding ? `skewX(${red.bodySkew - 12}deg) translateX(40px)` : `skewX(${red.bodySkew}deg)`
        }}
      >
        <div
          className="shape-eyes"
          style={{
            left: lookingAtEachOther ? 55 : 45 + red.faceX,
            top: lookingAtEachOther ? 65 : 40 + red.faceY
          }}
        >
          {[0, 1].map(item => (
            <Eye
              key={item}
              size={18}
              pupilSize={7}
              maxDistance={5}
              isBlinking={redBlinking}
              forceLookX={lookingAtEachOther ? 3 : undefined}
              forceLookY={lookingAtEachOther ? 4 : undefined}
            />
          ))}
        </div>
      </div>

      <div
        ref={tealRef}
        className="login-shape login-shape-teal"
        style={{
          transform: lookingAtEachOther
            ? `skewX(${teal.bodySkew * 1.5 + 10}deg) translateX(20px)`
            : isTyping || hiding
              ? `skewX(${teal.bodySkew * 1.5}deg)`
              : `skewX(${teal.bodySkew}deg)`
        }}
      >
        <div
          className="shape-eyes"
          style={{
            left: lookingAtEachOther ? 32 : 26 + teal.faceX,
            top: lookingAtEachOther ? 12 : 32 + teal.faceY
          }}
        >
          {[0, 1].map(item => (
            <Eye
              key={item}
              size={16}
              pupilSize={6}
              maxDistance={4}
              isBlinking={tealBlinking || hiding}
              forceLookY={lookingAtEachOther ? -4 : undefined}
            />
          ))}
        </div>
      </div>

      <div
        ref={pinkRef}
        className="login-shape login-shape-pink"
        style={{ transform: `skewX(${pink.bodySkew}deg)` }}
      >
        <div className="shape-eyes" style={{ left: 82 + pink.faceX, top: 90 + pink.faceY }}>
          {[0, 1].map(item => (
            <Pupil key={item} />
          ))}
        </div>
      </div>

      <div
        ref={yellowRef}
        className="login-shape login-shape-yellow"
        style={{ transform: `skewX(${yellow.bodySkew}deg)` }}
      >
        <div className="shape-eyes" style={{ left: 52 + yellow.faceX, top: 40 + yellow.faceY }}>
          {[0, 1].map(item => (
            <Pupil key={item} />
          ))}
        </div>
        <div className="shape-mouth" style={{ left: 40 + yellow.faceX, top: 88 + yellow.faceY }} />
      </div>
    </div>
  );
}
