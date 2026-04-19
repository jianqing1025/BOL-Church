import React, { useState, useEffect, useRef } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import Editable from './Editable';
import { useAdmin } from '../hooks/useAdmin';
import { resizeImageToBlob } from '../imageUpload';
import { buildMediaSlots } from '../media';

const Hero: React.FC = () => {
  const { t } = useLocalization();
  const { images, isAdminMode, uploadImage, canEditContent } = useAdmin();
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
      
      {isAdminMode && canEditContent('hero.image') && (
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
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-4 pb-10 pt-28 sm:px-6 sm:pt-32 md:pt-40">
        <Editable
          as="h1"
          contentKey="hero.title"
          className="mx-auto mb-3 max-w-[17rem] text-2xl font-bold leading-tight tracking-tight drop-shadow-lg min-[380px]:max-w-[20rem] min-[380px]:text-3xl sm:max-w-2xl sm:text-4xl md:max-w-4xl md:text-6xl"
        />
        <Editable
          as="p"
          contentKey="hero.subtitle"
          className="mx-auto mb-6 max-w-[17rem] text-base leading-relaxed drop-shadow-md min-[380px]:max-w-xs min-[380px]:text-lg sm:mb-8 sm:max-w-2xl sm:text-xl md:text-2xl"
        />
        <div className="flex w-full max-w-xs flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center sm:gap-4">
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:gap-4">
            <a href="#about" className="w-full bg-white/20 backdrop-blur-sm border border-white text-white px-5 py-2.5 rounded-full hover:bg-white/30 transition-all font-semibold text-sm transform hover:scale-105 min-[380px]:px-6 min-[380px]:py-3 min-[380px]:text-base sm:w-auto sm:px-8 sm:text-lg">
              <Editable as="span" contentKey="hero.whoWeAre" />
            </a>
            <a href="/sermons/sunday-worship" className="w-full bg-white/20 backdrop-blur-sm border border-white text-white px-5 py-2.5 rounded-full hover:bg-white/30 transition-all font-semibold text-sm transform hover:scale-105 min-[380px]:px-6 min-[380px]:py-3 min-[380px]:text-base sm:w-auto sm:px-8 sm:text-lg">
              <Editable as="span" contentKey="hero.sundayService" />
            </a>
          </div>
          <a href="/contact/join-us" className="w-full bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 transition-all font-bold text-sm transform hover:scale-105 min-[380px]:px-6 min-[380px]:py-3 min-[380px]:text-base sm:w-auto sm:px-8 sm:py-4 sm:text-lg">
            <Editable as="span" contentKey="hero.button" />
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
