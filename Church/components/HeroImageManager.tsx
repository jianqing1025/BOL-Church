import React, { useRef, useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { resizeImageToBlob } from '../imageUpload';
import { buildMediaSlots, nextMediaKey, type MediaKind, type MediaSlot } from '../media';

type MediaSectionProps = {
  kind: MediaKind;
  title: string;
  description: string;
  addLabel: string;
};

const MediaCard: React.FC<{
  slot: MediaSlot;
  imageUrl: string;
  isUploading: boolean;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>, slot: MediaSlot) => void;
}> = ({ slot, imageUrl, isUploading, onUpload }) => (
  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
    <img
      src={imageUrl}
      alt={slot.label}
      className="h-44 w-full object-cover"
    />
    <div className="space-y-3 p-4">
      <div>
        <div className="font-semibold text-gray-900">{slot.label}</div>
        <div className="text-sm text-gray-500">{slot.hint}</div>
        <div className="mt-1 break-all text-xs text-gray-400">{slot.key}</div>
      </div>
      <label className="inline-flex cursor-pointer items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
        {isUploading ? 'Uploading...' : 'Switch Image'}
        <input
          type="file"
          className="hidden"
          accept="image/*"
          disabled={isUploading}
          onChange={event => onUpload(event, slot)}
        />
      </label>
    </div>
  </div>
);

const MediaSection: React.FC<MediaSectionProps> = ({ kind, title, description, addLabel }) => {
  const { images, uploadImage, canEditContent } = useAdmin();
  const addInputRef = useRef<HTMLInputElement>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const slots = buildMediaSlots(kind, images);
  const canEdit = slots.some(slot => canEditContent(slot.key));

  if (!canEdit) {
    return null;
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>, slot: MediaSlot) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setUploadingKey(slot.key);
    try {
      const resizedImage = await resizeImageToBlob(file, slot.width, slot.height);
      await uploadImage(slot.key, resizedImage, file.name);
    } catch (error) {
      console.error('Image processing failed', error);
      const message = error instanceof Error ? error.message : 'Image upload failed.';
      alert(message);
    } finally {
      setUploadingKey(null);
    }
  };

  const handleAdd = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextKey = nextMediaKey(kind, images);
    const nextSlot = buildMediaSlots(kind, { ...images, [nextKey]: '' }).find(slot => slot.key === nextKey);
    if (nextSlot) {
      await handleUpload(event, nextSlot);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => addInputRef.current?.click()}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          {uploadingKey === '__add__' ? 'Uploading...' : addLabel}
        </button>
        <input
          ref={addInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={event => {
            setUploadingKey('__add__');
            void handleAdd(event).finally(() => setUploadingKey(null));
          }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {slots.filter(slot => canEditContent(slot.key)).map(slot => (
          <MediaCard
            key={slot.key}
            slot={slot}
            imageUrl={images[slot.key] || slot.placeholder}
            isUploading={uploadingKey === slot.key}
            onUpload={(event, currentSlot) => void handleUpload(event, currentSlot)}
          />
        ))}
      </div>
    </section>
  );
};

const HeroImageManager: React.FC = () => (
  <div className="space-y-6">
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Manage Media</h2>
      <p className="text-sm text-gray-600">Upload images to R2 and save their active slots in D1. Changes are reflected live across the website.</p>
    </div>

    <MediaSection
      kind="hero"
      title="Hero Slides"
      description="Homepage slideshow backgrounds. Add a new slide or switch any existing image."
      addLabel="Add Hero Slide"
    />

    <MediaSection
      kind="event"
      title="Event Cards"
      description="Homepage event card images. Add more cards or switch existing card images."
      addLabel="Add Event Card"
    />
  </div>
);

export default HeroImageManager;
