import React from 'react';
import { useAdmin } from '../hooks/useAdmin';

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

const heroImageConfigs = [
  { key: 'hero.image1', placeholder: 'https://images.unsplash.com/photo-1587270613324-420899114999?q=80&w=1920&auto=format&fit=crop' },
  { key: 'hero.image2', placeholder: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=2670' },
  { key: 'hero.image3', placeholder: 'https://picsum.photos/1920/1080?random=3' },
];

const HeroImageManager: React.FC = () => {
    const { images, updateImage } = useAdmin();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, imageKey: string) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const resizedDataUrl = await resizeImage(file, 1920, 1080);
                updateImage(imageKey, resizedDataUrl);
            } catch (error) {
                console.error("Image processing failed", error);
                alert("Failed to process image. Please try a different one.");
            }
        }
    };
    
    return (
        <div>
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Manage Hero Slideshow Images</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {heroImageConfigs.map((config, index) => (
                    <div key={config.key} className="space-y-2">
                        <img src={images[config.key] || config.placeholder} alt={`Slide ${index + 1}`} className="w-full h-32 object-cover rounded-lg shadow-sm" />
                        <div>
                          <label htmlFor={`hero-image-upload-${index}`} className="cursor-pointer bg-blue-100 text-blue-700 text-sm font-semibold px-4 py-2 rounded-md hover:bg-blue-200 transition-colors">
                              Change Image
                          </label>
                          <input
                              id={`hero-image-upload-${index}`}
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={(e) => handleFileChange(e, config.key)}
                          />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default HeroImageManager;