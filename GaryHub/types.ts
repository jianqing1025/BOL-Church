
export interface NavItem { label: string; href: string; active?: boolean; action?: () => void; }
export interface TimeLeft { days: number; hours: number; minutes: number; seconds: number; }
export interface ExifData {
    shotAt?: string;
    camera?: string;
    lens?: string;
    focalLength?: string;
    aperture?: string;
    shutter?: string;
    iso?: number;
    width?: number;
    height?: number;
    sizeBytes?: number;
}
export interface GalleryItem { id?: string; src: string; title: string; category?: string; collection?: string; album?: string; createdAt?: any; sizeBytes?: number; exif?: ExifData; sourceType?: 'remote' | 'local'; localAssetId?: number; localFilePath?: string; thumbSrc?: string; }
export interface VideoItem { id?: string; title: string; video: string; desc: string; category?: string; collection?: string; album?: string; createdAt?: any; sizeBytes?: number; sourceType?: 'remote' | 'local'; localAssetId?: number; localFilePath?: string; thumbSrc?: string; }
export interface TileData { id: string; type: 'single' | 'double' | 'wide' | 'ghost' | 'wing' | 'wide-3'; top: GalleryItem | VideoItem | null; bottom?: GalleryItem | VideoItem | null; status: string; }
export interface GuestMessage { id: string; name: string; location: string; content: string; date: string; approved: boolean; createdAt?: any; }

export type SlideshowMode = 'standard' | 'wings' | 'shifting' | 'tiles-shifting' | 'sliding-tiles' | 'vista' | 'flow-drift' | 'quad-horizon';

// Sort field + direction — two independent axes.
// Tie-breaker is always createdAt DESC for stable ordering.
export type SortField = 'shotAt' | 'uploadedAt' | 'sizeBytes';
export type SortDir   = 'asc' | 'desc';

export interface LocalImportConfig {
    id: string;
    label: string;
    category: string;
    type: 'photo' | 'video';
}

export interface AppConfig { 
    countdownDate: string;
    heroImages: string[];
    galleryTitle: string;
    gallerySubtitle: string;
    quoteText: string;
    quoteImage: string;
    accessPassword: string;
    localImports: LocalImportConfig[];
    photoCategories?: string[];
    videoCategories?: string[];
}

export interface ScanResultGroup<T = GalleryItem | VideoItem> {
    size: number;
    formattedSize: string;
    items: T[];
}
