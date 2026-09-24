/// <reference types="vite/client" />

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
