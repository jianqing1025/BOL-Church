/// <reference types="vite/client" />

/** What the desktop shell offers for 聚會內容 on disk (see desktop/agendaFolder.cjs). */
interface DesktopAgendaBridge {
  describe: () => Promise<{ dir: string; bytes: number }>;
  list: () => Promise<import('./meeting/agenda/types').Agenda[]>;
  save: (agenda: import('./meeting/agenda/types').Agenda) => Promise<void>;
  remove: (id: string) => Promise<void>;
  prune: () => Promise<void>;
  putFile: (bytes: ArrayBuffer, type: string) => Promise<string>;
  getFile: (id: string) => Promise<{ bytes: Uint8Array; type: string; size: number } | null>;
  deleteFile: (id: string) => Promise<void>;
  pickVideo: () => Promise<{ path: string; name: string; size: number } | null>;
  videoExists: (path: string) => Promise<boolean>;
  videoUrl: (path: string) => string;
}

interface Window {
  meetingDesktop?: {
    setStage: (stage: 'auth' | 'pick' | 'room') => void;
    setSharing: (active: boolean) => void;
    expand: () => void;
    compact: () => void;
    minimize: () => void;
    close: () => void;
    onCompact: (callback: (compact: boolean) => void) => () => void;
    // Added in desktop 0.2; an older executable lacks them, so call optionally.
    toggleMaximize?: () => void;
    // Added in desktop 0.3.
    setCompactHeight?: (height: number) => void;
    quit?: () => void;
    onWindowState?: (callback: (state: { compact: boolean; maximized: boolean; sharing: boolean }) => void) => () => void;
    onCloseRequest?: (callback: () => void) => () => void;
    // Added in desktop 1.1: 聚會內容 in a BOLCCOP folder beside the exe.
    agenda?: DesktopAgendaBridge;
  };
}

/**
 * Capturing a playing media element as a stream is standard but not in the DOM
 * lib types. Firefox only ships the prefixed form, so both are declared and the
 * meeting code feature-detects rather than assuming either.
 */
interface HTMLMediaElement {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
}
