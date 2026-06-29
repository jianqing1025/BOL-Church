
import { GalleryItem, VideoItem } from '../types';

/**
 * Determines the best filename for an exported item based on URL, title, and MIME type.
 * Preserves the original sanitization logic.
 */
export const determineFilename = (src: string, title: string, type: 'photo' | 'video', mimeType?: string): string => {
    let filename = '';
    
    // Strategy 1: Try to extract filename from URL (if it's not a blob)
    if (src.startsWith('http') && !src.includes('blob:')) {
        try {
            const urlObj = new URL(src);
            const pathParts = urlObj.pathname.split('/');
            const lastPart = pathParts[pathParts.length - 1];
            // Only use if it looks like a filename with extension
            if (lastPart && lastPart.includes('.')) { 
                filename = decodeURIComponent(lastPart); 
            }
        } catch (e) {}
    }
    
    // Strategy 2: Generate from Title if URL extraction failed
    if (!filename) {
        let ext = 'jpg'; // Default
        if (type === 'photo') {
             // If mimeType is like 'image/png', use 'png'
             ext = mimeType ? (mimeType.split('/')[1] || 'jpg') : 'jpg';
             if (ext === 'jpeg') ext = 'jpg';
        } else {
             ext = 'mp4';
        }
        
        // Improved sanitization: Keep Chinese, alphanumeric, spaces, and brackets/symbols
        const safeTitle = (title || (type === 'photo' ? 'image' : 'video'))
            .replace(/[^a-z0-9\-_ \(\)\[\]\+\.\u4e00-\u9fa5]/gi, '_')
            .trim();
        filename = `${safeTitle}.${ext}`;
    }
    return filename;
};

/**
 * Exports items using the File System Access API (Directory Picker).
 * Allows saving all files to a specific folder at once.
 * Returns the count of successfully exported items.
 */
export const exportViaDirectoryPicker = async (items: (GalleryItem | VideoItem)[], type: 'photo' | 'video'): Promise<number> => {
    // @ts-ignore
    if (!window.showDirectoryPicker) throw new Error("Directory Picker API not supported");

    // @ts-ignore
    const dirHandle = await window.showDirectoryPicker();
    let successCount = 0;
    
    for (const item of items) {
        try {
            const url = type === 'photo' ? (item as GalleryItem).src : (item as VideoItem).video;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Fetch failed for ${url}`);
            
            const blob = await response.blob();
            const filename = determineFilename(url, item.title, type, blob.type);
            
            // @ts-ignore
            const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
            // @ts-ignore
            const writable = await fileHandle.createWritable();
            // @ts-ignore
            await writable.write(blob);
            // @ts-ignore
            await writable.close();
            successCount++;
        } catch (err) {
            console.error(`Export failed for item: ${item.title}`, err);
        }
    }
    return successCount;
};

/**
 * Exports items using standard browser download (<a> tag).
 * Downloads items one by one with a delay to prevent browser blocking.
 */
export const exportViaBrowserDownload = async (items: (GalleryItem | VideoItem)[], type: 'photo' | 'video'): Promise<void> => {
    for (const item of items) {
        try {
            const url = type === 'photo' ? (item as GalleryItem).src : (item as VideoItem).video;
            const response = await fetch(url);
            const blob = await response.blob();
            
            const filename = determineFilename(url, item.title, type, blob.type);
            const blobUrl = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            
            a.click();
            
            // Clean up
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
            
            // Throttle downloads to prevent browser blocking
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error(`Download failed for item: ${item.title}`, error);
        }
    }
};
