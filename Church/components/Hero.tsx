import React, { useState, useEffect, useRef } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import Editable from './Editable';
import { useAdmin } from '../hooks/useAdmin';

const imagesConfig = [
  { key: 'hero.image1', src: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=2673' },
  { key: 'hero.image2', src: 'https://images.unsplash.com/photo-1478147427282-58a87a120781?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=3870' },
  { key: 'hero.image3', src: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=2670' },]
  //{ key: 'hero.image4', src: '../public/images/1.jpg' },]

  //  { key: 'hero.image3', src: 'https://picsum.photos/1920/1080?random=3' },]

// Helper function to resize images before saving
const resizeImage = (file: File, maxWidth: number, maxHeight: number, quality: number = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      if (!event.target?.result) {
        return reject(new Error("FileReader did not return a result."));
      }
      img.src = event.target.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context'));
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', quality)); 
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};


const Hero: React.FC = () => {
  const { t } = useLocalization();
  const { images, isAdminMode, updateImage } = useAdmin();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % imagesConfig.length);
    }, 5000); // Change image every 5 seconds

    return () => clearInterval(timer);
  }, []);

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              const currentImageKey = imagesConfig[currentImageIndex].key;
              const resizedDataUrl = await resizeImage(file, 1920, 1080); // Higher res for hero
              updateImage(currentImageKey, resizedDataUrl);
          } catch (error) {
              console.error("Image processing failed", error);
              alert("Failed to process image. Please try a different one.");
          }
      }
  };

  return (
    <section id="home" className="relative h-screen flex items-center justify-center text-center text-white bg-black">
      {imagesConfig.map((imageConfig, index) => (
        <div
          key={imageConfig.key}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
          style={{
            backgroundImage: `url(${images[imageConfig.key] || imageConfig.src})`,
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