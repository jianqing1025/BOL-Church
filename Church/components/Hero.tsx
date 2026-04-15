import React, { useState, useEffect, useRef } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import Editable from './Editable';
import { useAdmin } from '../hooks/useAdmin';
import { resizeImageToBlob } from '../imageUpload';
import { buildMediaSlots } from '../media';

const Hero: React.FC = () => {
  const { t } = useLocalization();
  const { images, isAdminMode, uploadImage } = useAdmin();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const heroSlides = buildMediaSlots('hero', images);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImageIndex(prevIndex => (prevIndex + 1) % heroSlides.length);
    }, 5000); // Change image every 5 seconds

    return () => clearInterval(timer);
  }, [heroSlides.length]);

  useEffect(() => {
    if (currentImageIndex >= heroSlides.length) {
      setCurrentImageIndex(0);
    }
  }, [currentImageIndex, heroSlides.length]);

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              const currentImageKey = heroSlides[currentImageIndex]?.key ?? heroSlides[0].key;
              const resizedImage = await resizeImageToBlob(file, 1920, 1080);
              await uploadImage(currentImageKey, resizedImage, file.name);
          } catch (error) {
              console.error("Image processing failed", error);
              const message = error instanceof Error ? error.message : 'Image upload failed.';
              alert(message);
          }
      }
  };

  return (
    <section id="home" className="relative h-screen flex items-center justify-center text-center text-white bg-black">
      {heroSlides.map((imageConfig, index) => (
        <div
          key={imageConfig.key}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
          style={{
            backgroundImage: `url(${images[imageConfig.key] || imageConfig.placeholder})`,
            opacity: index === currentImageIndex ? 1 : 0,
          }}
        />
      ))}
      
      {isAdminMode && (
        <>
            <div className="absolute top-24 right-4 z-20">
                <button
                    onClick={handleImageUploadClick}
                    className="bg-white/80 backdrop-blur-sm text-gray-800 font-semibold px-4 py-2 rounded-lg shadow-md hover:bg-white transition-colors"
                >
                    Change Background
                </button>
            </div>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*"
            />
        </>
      )}

      <div className="absolute inset-0 bg-black opacity-40"></div>
      <div className="relative z-10 p-6">
        <Editable
          as="h1"
          contentKey="hero.title"
          className="text-4xl md:text-6xl font-bold mb-4 leading-tight tracking-tight drop-shadow-lg"
        />
        <Editable
          as="p"
          contentKey="hero.subtitle"
          className="text-lg md:text-2xl mb-8 drop-shadow-md"
        />
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="flex flex-row gap-4">
            <a href="#about" className="bg-white/20 backdrop-blur-sm border border-white text-white px-8 py-3 rounded-full hover:bg-white/30 transition-all font-semibold text-lg transform hover:scale-105">
              <Editable as="span" contentKey="hero.whoWeAre" />
            </a>
            <a href="#/sermons/recent-sermons" className="bg-white/20 backdrop-blur-sm border border-white text-white px-8 py-3 rounded-full hover:bg-white/30 transition-all font-semibold text-lg transform hover:scale-105">
              <Editable as="span" contentKey="hero.sundayService" />
            </a>
          </div>
          <a href="#contact" className="bg-blue-600 text-white px-8 py-4 rounded-full hover:bg-blue-700 transition-all font-bold text-lg transform hover:scale-105">
            <Editable as="span" contentKey="hero.button" />
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
