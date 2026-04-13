

import React, { useRef } from 'react';
import { useLocalization } from '../hooks/useLocalization';
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

interface EditableImageProps {
  imageKey: string;
  className?: string;
  alt: string;
  placeholderSrc: string;
}

const EditableImage: React.FC<EditableImageProps> = ({ imageKey, className, alt, placeholderSrc }) => {
    const { isAdminMode, images, updateImage } = useAdmin();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const imageUrl = images[imageKey] || placeholderSrc;

    const handleImageClick = () => {
        if (isAdminMode) {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const resizedDataUrl = await resizeImage(file, 800, 600);
                updateImage(imageKey, resizedDataUrl);
            } catch (error) {
                console.error("Image processing failed", error);
                alert("Failed to process image. Please try a different one.");
            }
        }
    };

    return (
        <div className={`relative ${isAdminMode ? 'cursor-pointer group' : ''}`} onClick={handleImageClick}>
            <img src={imageUrl} alt={alt} className={className} />
            {isAdminMode && (
                <>
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white font-bold text-lg">Change Image</span>
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
        </div>
    );
};


interface EventCardProps {
  imageSrc: string;
  title: string;
  date: string;
  imageKey: string;
}

const EventCard: React.FC<EventCardProps> = ({ imageSrc, title, date, imageKey }) => (
  <div className="bg-white rounded-lg shadow-lg overflow-hidden transform hover:-translate-y-2 transition-transform duration-300">
    <EditableImage
        imageKey={imageKey}
        placeholderSrc={imageSrc}
        alt={title}
        className="w-full h-48 object-cover"
    />
    <div className="p-6">
      <h3 className="font-bold text-xl mb-2">{title}</h3>
      <p className="text-gray-600">{date}</p>
    </div>
  </div>
);

const Events: React.FC = () => {
  const { t } = useLocalization();

  const eventData = [
    { imageSrc: 'https://images.unsplash.com/photo-1630467355731-963887fa179a?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=2670', titleKey: 'events.event1Title', dateKey: 'events.event1Date', imageKey: 'events.event1.image' },
    { imageSrc: 'https://images.unsplash.com/photo-1501060380799-184ae00cf089?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=2670', titleKey: 'events.event2Title', dateKey: 'events.event2Date', imageKey: 'events.event2.image' },
    { imageSrc: 'https://images.unsplash.com/photo-1509021436665-8f07dbf5bf1d?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=2274', titleKey: 'events.event3Title', dateKey: 'events.event3Date', imageKey: 'events.event3.image' },
    { imageSrc: 'https://images.unsplash.com/photo-1600288480699-0b0d8a456dd8?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=2670', titleKey: 'events.event4Title', dateKey: 'events.event4Date', imageKey: 'events.event4.image' },
  ];

  return (
    <section id="events" className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-gray-800">{t('events.title')}</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {eventData.map((event, index) => (
            <EventCard key={index} imageSrc={event.imageSrc} title={t(event.titleKey)} date={t(event.dateKey)} imageKey={event.imageKey} />
          ))}
        </div>
        <div className="text-center mt-12">
           <a href="#/events/" className="bg-gray-800 text-white px-8 py-3 rounded-full hover:bg-gray-900 transition-all font-semibold">
             {t('events.button')}
           </a>
        </div>
      </div>
    </section>
  );
};

export default Events;