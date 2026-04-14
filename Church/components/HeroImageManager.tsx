import React from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { resizeImageToBlob } from '../imageUpload';

const heroImageConfigs = [
  { key: 'hero.image1', placeholder: 'https://images.unsplash.com/photo-1587270613324-420899114999?q=80&w=1920&auto=format&fit=crop' },
  { key: 'hero.image2', placeholder: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=2670' },
  { key: 'hero.image3', placeholder: 'https://picsum.photos/1920/1080?random=3' },
];

const HeroImageManager: React.FC = () => {
  const { images, uploadImage } = useAdmin();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, imageKey: string) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const resizedImage = await resizeImageToBlob(file, 1920, 1080);
      await uploadImage(imageKey, resizedImage, file.name);
    } catch (error) {
      console.error('Image processing failed', error);
      alert('Failed to process image. Please try a different one.');
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
