import React from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { resizeImageToBlob } from '../imageUpload';

type MediaSlot = {
  key: string;
  label: string;
  hint: string;
  placeholder: string;
  width: number;
  height: number;
};

const mediaSlots: MediaSlot[] = [
  {
    key: 'hero.image1',
    label: 'Hero Slide 1',
    hint: 'Homepage background',
    placeholder: 'https://images.unsplash.com/photo-1587270613324-420899114999?q=80&w=1920&auto=format&fit=crop',
    width: 1920,
    height: 1080,
  },
  {
    key: 'hero.image2',
    label: 'Hero Slide 2',
    hint: 'Homepage background',
    placeholder: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=2670',
    width: 1920,
    height: 1080,
  },
  {
    key: 'hero.image3',
    label: 'Hero Slide 3',
    hint: 'Homepage background',
    placeholder: 'https://picsum.photos/1920/1080?random=3',
    width: 1920,
    height: 1080,
  },
  {
    key: 'events.event1.image',
    label: 'Event Card 1',
    hint: 'Joint group fellowship',
    placeholder: 'https://images.unsplash.com/photo-1630467355731-963887fa179a?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=2670',
    width: 800,
    height: 600,
  },
  {
    key: 'events.event2.image',
    label: 'Event Card 2',
    hint: "Sisters' group",
    placeholder: 'https://images.unsplash.com/photo-1501060380799-184ae00cf089?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=2670',
    width: 800,
    height: 600,
  },
  {
    key: 'events.event3.image',
    label: 'Event Card 3',
    hint: 'Sunday worship',
    placeholder: 'https://images.unsplash.com/photo-1509021436665-8f07dbf5bf1d?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=2274',
    width: 800,
    height: 600,
  },
  {
    key: 'events.event4.image',
    label: 'Event Card 4',
    hint: 'Prayer meeting',
    placeholder: 'https://images.unsplash.com/photo-1600288480699-0b0d8a456dd8?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=2670',
    width: 800,
    height: 600,
  },
];

const HeroImageManager: React.FC = () => {
  const { images, uploadImage } = useAdmin();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, slot: MediaSlot) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const resizedImage = await resizeImageToBlob(file, slot.width, slot.height);
      await uploadImage(slot.key, resizedImage, file.name);
      event.target.value = '';
    } catch (error) {
      console.error('Image processing failed', error);
      const message = error instanceof Error ? error.message : 'Image upload failed.';
      alert(message);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Manage Media</h2>
        <p className="text-sm text-gray-600">Replace homepage hero slides and event cards from one place.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {mediaSlots.map(slot => (
          <div key={slot.key} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <img
              src={images[slot.key] || slot.placeholder}
              alt={slot.label}
              className="h-44 w-full object-cover"
            />
            <div className="space-y-3 p-4">
              <div>
                <div className="font-semibold text-gray-900">{slot.label}</div>
                <div className="text-sm text-gray-500">{slot.hint}</div>
                <div className="mt-1 text-xs text-gray-400">{slot.key}</div>
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Upload Replacement
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={event => void handleFileChange(event, slot)}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HeroImageManager;
