import { useEffect, useRef, useState } from 'react';

interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
}

const Pupil = ({
  size = 12,
  maxDistance = 5,
  pupilColor = 'black',
  forceLookX,
  forceLookY
}: PupilProps) => {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      setMouseX(event.clientX);
      setMouseY(event.clientY);
    };
    window.addEventListener('mousemove', handle);
    return () => window.removeEventListener('mousemove', handle);
  }, []);

  const getPos = () => {
    if (!pupilRef.current) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) return { x: forceLookX, y: forceLookY };
    const rect = pupilRef.current.getBoundingClientRect();
    const dx = mouseX - (rect.left + rect.width / 2);
    const dy = mouseY - (rect.top + rect.height / 2);
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
  };

  const pos = getPos();
  return (
    <div
      ref={pupilRef}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: pupilColor,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: 'transform 0.1s ease-out'
      }}
    />
  );
};

interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
}

const EyeBall = ({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = 'white',
  pupilColor = 'black',
  isBlinking = false,
  forceLookX,
  forceLookY
}: EyeBallProps) => {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const eyeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      setMouseX(event.clientX);
      setMouseY(event.clientY);
    };
    window.addEventListener('mousemove', handle);
    return () => window.removeEventListener('mousemove', handle);
  }, []);

  const getPos = () => {
    if (!eyeRef.current) return { x: 0, y: 0 };
    if (forceLookX !== undefined && forceLookY !== undefined) return { x: forceLookX, y: forceLookY };
    const rect = eyeRef.current.getBoundingClientRect();
    const dx = mouseX - (rect.left + rect.width / 2);
    const dy = mouseY - (rect.top + rect.height / 2);
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
  };

  const pos = getPos();
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
        transition: 'height 0.15s ease'
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
            transition: 'transform 0.1s ease-out'
          }}
        />
      )}
    </div>
  );
};

interface LoginAnimationProps {
  isTyping?: boolean;
  passwordVisible?: boolean;
  passwordLength?: number;
}

export function LoginAnimation({
  isTyping = false,
  passwordVisible = false,
  passwordLength = 0
}: LoginAnimationProps) {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false);
  const [isBlackBlinking, setIsBlackBlinking] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);

  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      setMouseX(event.clientX);
      setMouseY(event.clientY);
    };
    window.addEventListener('mousemove', handle);
    return () => window.removeEventListener('mousemove', handle);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setIsPurpleBlinking(true);
        setTimeout(() => {
          setIsPurpleBlinking(false);
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
        setIsBlackBlinking(true);
        setTimeout(() => {
          setIsBlackBlinking(false);
          schedule();
        }, 150);
      }, Math.random() * 4000 + 3000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isTyping) {
      setIsLookingAtEachOther(true);
      const timer = setTimeout(() => setIsLookingAtEachOther(false), 800);
      return () => clearTimeout(timer);
    }
    setIsLookingAtEachOther(false);
  }, [isTyping]);

  useEffect(() => {
    if (passwordLength > 0 && passwordVisible) {
      let timer: ReturnType<typeof setTimeout>;
      const schedule = () => {
        timer = setTimeout(() => {
          setIsPurplePeeking(true);
          setTimeout(() => {
            setIsPurplePeeking(false);
          }, 800);
        }, Math.random() * 3000 + 2000);
      };
      schedule();
      return () => clearTimeout(timer);
    }
    setIsPurplePeeking(false);
  }, [passwordLength, passwordVisible, isPurplePeeking]);

  const calcPos = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 3;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    return {
      faceX: Math.max(-15, Math.min(15, dx / 20)),
      faceY: Math.max(-10, Math.min(10, dy / 30)),
      bodySkew: Math.max(-6, Math.min(6, -dx / 120))
    };
  };

  const pp = calcPos(purpleRef);
  const bp = calcPos(blackRef);
  const yp = calcPos(yellowRef);
  const op = calcPos(orangeRef);

  const hiding = passwordLength > 0 && !passwordVisible;
  const peeking = passwordLength > 0 && passwordVisible;

  return (
    <div className="login-animation-scene" aria-hidden="true">
      <div
        ref={purpleRef}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 70,
          width: 180,
          height: isTyping || hiding ? 440 : 400,
          backgroundColor: '#FF6B6B',
          borderRadius: '10px 10px 0 0',
          zIndex: 1,
          transition: 'all 0.7s ease-in-out',
          transform: peeking
            ? 'skewX(0deg)'
            : isTyping || hiding
              ? `skewX(${pp.bodySkew - 12}deg) translateX(40px)`
              : `skewX(${pp.bodySkew}deg)`,
          transformOrigin: 'bottom center'
        }}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: 32,
            left: peeking ? 20 : isLookingAtEachOther ? 55 : 45 + pp.faceX,
            top: peeking ? 35 : isLookingAtEachOther ? 65 : 40 + pp.faceY,
            transition: 'all 0.7s ease-in-out'
          }}
        >
          {[0, 1].map(item => (
            <EyeBall
              key={item}
              size={18}
              pupilSize={7}
              maxDistance={5}
              eyeColor="white"
              pupilColor="#2D2D2D"
              isBlinking={isPurpleBlinking}
              forceLookX={peeking ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
              forceLookY={peeking ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
            />
          ))}
        </div>
      </div>

      <div
        ref={blackRef}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 240,
          width: 120,
          height: 310,
          backgroundColor: '#00CEC9',
          borderRadius: '8px 8px 0 0',
          zIndex: 2,
          transition: 'all 0.7s ease-in-out',
          transform: peeking
            ? 'skewX(0deg)'
            : isLookingAtEachOther
              ? `skewX(${bp.bodySkew * 1.5 + 10}deg) translateX(20px)`
              : isTyping || hiding
                ? `skewX(${bp.bodySkew * 1.5}deg)`
                : `skewX(${bp.bodySkew}deg)`,
          transformOrigin: 'bottom center'
        }}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: 24,
            left: peeking ? 10 : isLookingAtEachOther ? 32 : 26 + bp.faceX,
            top: peeking ? 28 : isLookingAtEachOther ? 12 : 32 + bp.faceY,
            transition: 'all 0.7s ease-in-out'
          }}
        >
          {[0, 1].map(item => (
            <EyeBall
              key={item}
              size={16}
              pupilSize={6}
              maxDistance={4}
              eyeColor="white"
              pupilColor="#2D2D2D"
              isBlinking={isBlackBlinking}
              forceLookX={peeking ? -4 : isLookingAtEachOther ? 0 : undefined}
              forceLookY={peeking ? -4 : isLookingAtEachOther ? -4 : undefined}
            />
          ))}
        </div>
      </div>

      <div
        ref={orangeRef}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 240,
          height: 200,
          backgroundColor: '#FFEAA7',
          borderRadius: '120px 120px 0 0',
          zIndex: 3,
          transition: 'all 0.7s ease-in-out',
          transform: peeking ? 'skewX(0deg)' : `skewX(${op.bodySkew}deg)`,
          transformOrigin: 'bottom center'
        }}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: 32,
            left: peeking ? 50 : 82 + op.faceX,
            top: peeking ? 85 : 90 + op.faceY,
            transition: 'all 0.2s ease-out'
          }}
        >
          {[0, 1].map(item => (
            <Pupil
              key={item}
              size={12}
              maxDistance={5}
              pupilColor="#2D2D2D"
              forceLookX={peeking ? -5 : undefined}
              forceLookY={peeking ? -4 : undefined}
            />
          ))}
        </div>
      </div>

      <div
        ref={yellowRef}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 310,
          width: 140,
          height: 230,
          backgroundColor: '#FD79A8',
          borderRadius: '70px 70px 0 0',
          zIndex: 4,
          transition: 'all 0.7s ease-in-out',
          transform: peeking ? 'skewX(0deg)' : `skewX(${yp.bodySkew}deg)`,
          transformOrigin: 'bottom center'
        }}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: 24,
            left: peeking ? 20 : 52 + yp.faceX,
            top: peeking ? 35 : 40 + yp.faceY,
            transition: 'all 0.2s ease-out'
          }}
        >
          {[0, 1].map(item => (
            <Pupil
              key={item}
              size={12}
              maxDistance={5}
              pupilColor="#2D2D2D"
              forceLookX={peeking ? -5 : undefined}
              forceLookY={peeking ? -4 : undefined}
            />
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            width: 80,
            height: 4,
            backgroundColor: '#2D2D2D',
            borderRadius: 2,
            left: peeking ? 10 : 40 + yp.faceX,
            top: peeking ? 88 : 88 + yp.faceY,
            transition: 'all 0.2s ease-out'
          }}
        />
      </div>
    </div>
  );
}
