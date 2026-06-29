
import React, { useState, useRef, useEffect } from 'react';
import { Settings, Volume2, VolumeX } from 'lucide-react';
import FireworkCanvas from '../components/common/FireworkCanvas';
import HexagonMenu from '../components/home/HexagonMenu';
import { soundService } from '../services/soundService';

interface HomePageProps {
    onNavigate: (page: string) => void;
    isAdminLoggedIn: boolean;
    onAdminClick: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigate, isAdminLoggedIn, onAdminClick }) => {
    // Audio State
    const [showAudioControl, setShowAudioControl] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const clickCountRef = useRef(0);

    // Immersive Mode State (15 Clicks)
    const [isImmersiveMode, setIsImmersiveMode] = useState(false);
    const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // --- Timer Cleanup ---
    useEffect(() => {
        return () => {
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            // Cleanup sound when unmounting (leaving home page)
            soundService.fadeOutBgMusic();
        };
    }, []);

    const exitImmersiveMode = () => {
        setIsImmersiveMode(false);
        clickCountRef.current = 0;
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        soundService.fadeOutBgMusic();
        
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    };

    const handleFireworkInteraction = () => {
        // If in immersive mode, reset the 10s timer on interaction
        if (isImmersiveMode) {
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = setTimeout(exitImmersiveMode, 10000);
            return;
        }

        clickCountRef.current += 1;
        if (clickCountRef.current === 15) {
            setShowAudioControl(true);
            soundService.playBgMusic();
            
            // Trigger Immersive Mode
            setIsImmersiveMode(true);
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => console.log(err));
            }
            
            // Start inactivity timer
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = setTimeout(exitImmersiveMode, 10000);
        }
    };

    const toggleMute = () => {
        const newMuteState = !isMuted;
        setIsMuted(newMuteState);
        soundService.toggleMute(newMuteState);
    };

    return (
        <main className="site-wrapper relative bg-[#0c0f15]">
            
            {/* Immersive Background Layer - Video Upper Half */}
            <div className={`absolute top-0 left-0 w-full h-[50vh] z-0 transition-opacity duration-1000 ${isImmersiveMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <video 
                    src="https://res.cloudinary.com/ds3bggc9c/video/upload/v1768015579/northern-lights-pricing-desktop.avc.5b415a6b130cea522f45_czcqgh.mp4" 
                    className="w-full h-full object-cover opacity-80"
                    style={{ 
                        maskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)' 
                    }}
                    autoPlay 
                    muted 
                    loop 
                    playsInline 
                />
            </div>

            {/* Firework Canvas - FIXED FULL SCREEN in Immersive Mode */}
            <div className={`transition-all duration-1000 ${
                isImmersiveMode 
                    ? 'fixed inset-0 z-30 pointer-events-auto mix-blend-screen' 
                    : 'absolute inset-0 z-0'
            }`}>
                <FireworkCanvas onInteraction={handleFireworkInteraction} />
            </div>
            
            {/* Standard UI Content - Fades out in Immersive Mode */}
            <div className={`pt-table desktop-768 main-container pointer-events-none transition-all duration-1000 ${isImmersiveMode ? 'opacity-0 scale-110 filter blur-sm' : 'opacity-100 scale-100'}`}>
                <div className="pt-tablecell page-home relative" style={{ width: '100%', padding: '0 15px' }}>
                    
                    {/* Dark Overlay removed/transparent to let fireworks show */}
                    <div className="overlay pointer-events-none opacity-0"></div>

                    {/* Top Right Controls */}
                    <div className="absolute top-6 right-6 z-50 flex items-center gap-3 pointer-events-auto">
                        {/* Audio Toggle (Hidden until 15 clicks) */}
                        {showAudioControl && (
                            <button 
                                onClick={toggleMute} 
                                className="p-3 bg-white/10 hover:bg-white/20 text-white/50 hover:text-white backdrop-blur-md rounded-full transition-all border border-white/10"
                                title={isMuted ? "Unmute Music" : "Mute Music"}
                            >
                                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </button>
                        )}

                        {/* Admin Button */}
                        <button 
                            onClick={onAdminClick} 
                            className="p-3 bg-white/10 hover:bg-white/20 text-white/50 hover:text-white backdrop-blur-md rounded-full transition-all border border-white/10"
                            title="Settings"
                        >
                            <Settings size={20} />
                        </button>
                    </div>

                    <div className="container pointer-events-none" style={{ position: 'relative', zIndex: 1, maxWidth: '100%', width: 'auto' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            
                            {/* Header Section - pointer-events-auto */}
                            <div className="text-center title-section pointer-events-auto">
                                <h2 className="heading-page">
                                    &nbsp;
                                    <span 
                                        className="title-watermark" 
                                        style={{ 
                                            fontSize: 'clamp(30px, 5vw, 60px)', 
                                            letterSpacing: '4px',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        GaryLab Level 2
                                    </span>
                                </h2>
                            </div>

                            {/* Hexagon Menu Component */}
                            <HexagonMenu onNavigate={onNavigate} />
                            
                        </div>
                    </div>

                </div>
            </div>
        </main>
    );
};

export default HomePage;
