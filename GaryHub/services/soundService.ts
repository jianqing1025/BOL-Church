

class SoundService {
  private context: AudioContext | null = null;
  private shootBuffer: AudioBuffer | null = null;
  private explodeBuffer: AudioBuffer | null = null;
  private bgMusic: HTMLAudioElement | null = null;
  private isMuted: boolean = false;

  private shootUrl = 'https://res.cloudinary.com/ds3bggc9c/video/upload/v1767057585/shoot_puhrc2.ogg';
  private explodeUrl = 'https://res.cloudinary.com/ds3bggc9c/video/upload/v1767057459/explode_ccvddj.ogg';
  private bgMusicUrl = 'https://res.cloudinary.com/ds3bggc9c/video/upload/v1767057556/xqx_ijg6vu.ogg';

  constructor() {
    this.bgMusic = new Audio(this.bgMusicUrl);
    this.bgMusic.loop = true;
    this.bgMusic.volume = 0.5;
  }

  ensureContext() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
          this.context = new AudioContextClass();
          this.loadBuffers();
      }
    }
    if (this.context && this.context.state === 'suspended') {
      this.context.resume().catch((err) => console.warn("Audio resume failed", err));
    }
  }

  private async loadBuffers() {
    if (!this.context) return;

    try {
      // Load Shoot
      const shootResp = await fetch(this.shootUrl);
      const shootArray = await shootResp.arrayBuffer();
      this.shootBuffer = await this.context.decodeAudioData(shootArray);

      // Load Explode
      const explodeResp = await fetch(this.explodeUrl);
      const explodeArray = await explodeResp.arrayBuffer();
      this.explodeBuffer = await this.context.decodeAudioData(explodeArray);
    } catch (e) {
      console.error("Failed to load sound buffers", e);
    }
  }

  private playBuffer(buffer: AudioBuffer | null, volume: number = 1.0) {
    if (!this.context || !buffer || this.isMuted) return;
    
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    
    const gainNode = this.context.createGain();
    gainNode.gain.value = volume;
    
    source.connect(gainNode);
    gainNode.connect(this.context.destination);
    
    source.start(0);
  }

  playLaunch() {
    this.ensureContext();
    // Random pitch variation slightly if possible, but for buffers we just play
    this.playBuffer(this.shootBuffer, 0.4); 
  }

  playExplosion() {
    this.ensureContext();
    this.playBuffer(this.explodeBuffer, 0.6);
  }

  // Background Music Controls
  playBgMusic() {
    if (this.bgMusic) {
      // Reset volume in case it was faded out
      this.bgMusic.volume = 0.5;
      if (this.bgMusic.paused) {
        this.bgMusic.play().catch(e => console.log("BG play blocked", e));
      }
    }
  }

  pauseBgMusic() {
    if (this.bgMusic) {
      this.bgMusic.pause();
    }
  }

  fadeOutBgMusic() {
    if (!this.bgMusic || this.bgMusic.paused) return;

    const fadeDuration = 2000; // 2 seconds
    const intervalTime = 50;
    const steps = fadeDuration / intervalTime;
    const stepAmount = this.bgMusic.volume / steps;

    const fadeInterval = setInterval(() => {
        if (!this.bgMusic) {
            clearInterval(fadeInterval);
            return;
        }
        if (this.bgMusic.volume > stepAmount) {
            this.bgMusic.volume -= stepAmount;
        } else {
            this.bgMusic.volume = 0;
            this.bgMusic.pause();
            this.bgMusic.volume = 0.5; // Reset to default for next play
            clearInterval(fadeInterval);
        }
    }, intervalTime);
  }

  toggleMute(muted: boolean) {
    this.isMuted = muted;
    if (this.bgMusic) {
      this.bgMusic.muted = muted;
    }
    // Note: Effect sounds check this.isMuted inside playBuffer
  }
}

export const soundService = new SoundService();