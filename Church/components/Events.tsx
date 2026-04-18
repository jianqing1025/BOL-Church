import React, { useRef } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { useAdmin } from '../hooks/useAdmin';
import { resizeImageToBlob } from '../imageUpload';
import { buildMediaSlots, type MediaSlot } from '../media';

interface EditableImageProps {
  imageKey: string;
  className?: string;
  alt: string;
  placeholderSrc: string;
}

const EditableImage: React.FC<EditableImageProps> = ({ imageKey, className, alt, placeholderSrc }) => {
  const { isAdminMode, images, uploadImage } = useAdmin();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageUrl = images[imageKey] || placeholderSrc;

  const handleImageClick = () => {
    if (isAdminMode) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const resizedImage = await resizeImageToBlob(file, 800, 600);
      await uploadImage(imageKey, resizedImage, file.name);
    } catch (error) {
      console.error('Image processing failed', error);
      const message = error instanceof Error ? error.message : 'Image upload failed.';
      alert(message);
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
  slot: MediaSlot;
  title: string;
  date: string;
  href: string;
  isAdminMode: boolean;
}

const EventCard: React.FC<EventCardProps> = ({ slot, title, date, href, isAdminMode }) => {
  const cardContent = (
    <>
      <EditableImage
        imageKey={slot.key}
        placeholderSrc={slot.placeholder}
        alt={title}
        className="w-full h-48 object-cover"
      />
      <div className="p-6">
        <h3 className="font-bold text-xl mb-2">{title}</h3>
        <p className="text-gray-600">{date}</p>
      </div>
    </>
  );

  if (isAdminMode) {
    return <div className="bg-white rounded-lg shadow-lg overflow-hidden">{cardContent}</div>;
  }

  return (
    <a
      href={href}
      className="block overflow-hidden rounded-lg bg-white shadow-lg transition-transform duration-300 hover:-translate-y-2"
    >
      {cardContent}
    </a>
  );
};

const ministryCardLinks: Record<number, string> = {
  1: '/events/joint',
  2: '/events/women',
  3: '/events/',
  4: '/events/prayer',
};

const Events: React.FC = () => {
  const { t } = useLocalization();
  const { images, isAdminMode } = useAdmin();
  const eventCards = buildMediaSlots('event', images);

  return (
    <section id="events" className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-gray-800">{t('events.title')}</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {eventCards.map(slot => (
            <EventCard
              key={slot.key}
              slot={slot}
              title={t(`events.event${slot.index}Title`) === `events.event${slot.index}Title` ? slot.label : t(`events.event${slot.index}Title`)}
              date={t(`events.event${slot.index}Date`) === `events.event${slot.index}Date` ? slot.hint : t(`events.event${slot.index}Date`)}
              href={ministryCardLinks[slot.index] ?? '/events/'}
              isAdminMode={isAdminMode}
            />
          ))}
        </div>
        <div className="text-center mt-12">
          <a href="/events/" className="bg-gray-800 text-white px-8 py-3 rounded-full hover:bg-gray-900 transition-all font-semibold">
            {t('events.button')}
          </a>
        </div>
      </div>
    </section>
  );
};

export default Events;
