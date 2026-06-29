
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppConfig } from '../../types';

// Fallback is handled in parent or here
const HeroSlider = ({ images }: { images: string[] }) => {
  const [currentSlide, setCurrentSlide] = useState(0); 
  const safeImages = images && images.length > 0 ? images : [];
  
  const nextSlide = useCallback(() => setCurrentSlide((prev) => (prev + 1) % safeImages.length), [safeImages.length]);
  useEffect(() => { 
      if (safeImages.length <= 1) return;
      const timer = setInterval(nextSlide, 5000); 
      return () => clearInterval(timer); 
  }, [nextSlide, safeImages.length]);

  if (safeImages.length === 0) return <div className="h-[600px] bg-gray-200" />;

  return (
    <header id="home" className="relative h-[600px] md:h-screen w-full overflow-hidden">
      {safeImages.map((img, index) => (<div key={index} className={`absolute inset-0 transition-opacity duration-1000 ${index === currentSlide ? 'opacity-100' : 'opacity-0'}`}><img crossOrigin="anonymous" src={img} alt="Slide" className="w-full h-full object-cover" /></div>))}
      <button onClick={() => setCurrentSlide((prev) => (prev - 1 + safeImages.length) % safeImages.length)} className="absolute left-8 top-1/2 -translate-y-1/2 z-30 text-white/70"><ChevronLeft size={48} /></button>
      <button onClick={nextSlide} className="absolute right-8 top-1/2 -translate-y-1/2 z-30 text-white/70"><ChevronRight size={48} /></button>
    </header>
  );
};

export default HeroSlider;
