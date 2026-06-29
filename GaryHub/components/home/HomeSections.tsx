
import React from 'react';
import SectionHeader from '../common/SectionHeader';
import VideoCard from '../common/VideoCard';
import { GalleryItem, VideoItem } from '../../types';
import { getOptimizedUrl } from '../../utils';

// StorySection removed as it is no longer used in the new design.

export const GallerySection = ({ onViewGallery, galleryData, title, subtitle }: { onViewGallery: () => void, galleryData: GalleryItem[], title: string, subtitle: string }) => (
    <section className="py-24 bg-white"><div className="container mx-auto px-4 text-center"><SectionHeader title={title} subtitle={subtitle} /><div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-12">{galleryData.slice(0, 6).map((img, idx) => (<div key={idx} className="group relative overflow-hidden shadow-md rounded"><img crossOrigin="anonymous" src={getOptimizedUrl(img.src, 'grid')} alt="Gallery" className="w-full h-auto block transform transition-transform duration-500 group-hover:scale-110" /><div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity duration-300"><span className="text-white text-lg uppercase mb-2">{img.title}</span><span className="text-white/70 text-xs uppercase">{img.category}</span></div></div>))}</div><button onClick={onViewGallery} className="px-8 py-3 bg-brand text-white font-bold uppercase tracking-wider rounded shadow-md">View Full Gallery</button></div></section>
);

export const QuoteSection = ({ text, image }: { text: string, image: string }) => (
    <section className="bg-brand-dark py-24 bg-fixed bg-cover relative" style={{ backgroundImage: `url(${image})` }}><div className="absolute inset-0 bg-black/70"></div><div className="container mx-auto px-4 relative z-10 text-center"><blockquote className="p-8 text-2xl md:text-4xl text-white font-serif italic">"{text}"</blockquote></div></section>
);

export const BlogSection = ({ onVideoClick, onViewMore, videosData }: { onVideoClick: (idx: number) => void, onViewMore: () => void, videosData: VideoItem[] }) => (
    <section className="py-24 bg-[#F9F9F9] border-t border-b border-[#DDD]" id="blog"><div className="container mx-auto px-4"><SectionHeader title="Our Stories" subtitle="Read about our journey" /><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">{videosData.slice(0, 9).map((post, idx) => ( <VideoCard key={idx} video={post} onClick={() => onVideoClick(idx)} forceAspect="aspect-[3/4]" /> ))}</div><div className="text-center mt-12"><button onClick={onViewMore} className="px-8 py-3 bg-brand text-white font-bold uppercase tracking-wider rounded shadow-md">More Stories</button></div></div></section>
);
