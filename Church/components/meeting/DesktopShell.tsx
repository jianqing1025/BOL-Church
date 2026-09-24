import React, { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';

type DesktopStage = 'auth' | 'pick' | 'room' | null;
interface WindowState { compact: boolean; maximized: boolean }

/** Tracks the native window: collapsed to the share bar, and maximized. */
export function useDesktopWindow(): WindowState {
  const [state, setState] = useState<WindowState>({ compact: false, maximized: false });
  useEffect(() => {
    const desktop = window.meetingDesktop;
    if (!desktop) return;
    // An older executable only reports the compact flag.
    if (desktop.onWindowState) return desktop.onWindowState(({ compact, maximized }) => setState({ compact, maximized }));
    return desktop.onCompact((compact) => setState((prev) => ({ ...prev, compact })));
  }, []);
  return state;
}

/** Width the window buttons take in the top-right corner; headers leave this much room. */
export const DESKTOP_CONTROLS_WIDTH = 138;

const controlClass = 'flex h-9 w-[46px] items-center justify-center transition-colors';

/**
 * The frameless window's own chrome. There is no title strip: the controls sit
 * in the page's top-right corner, and the page header beneath them is the drag
 * area — the way Zoom and Teams look on Windows.
 */
export const DesktopShell: React.FC<React.PropsWithChildren<{ stage: DesktopStage }>> = ({ children, stage }) => {
  const { compact, maximized } = useDesktopWindow();
  const login = stage === null || stage === 'auth';
  const dark = stage === 'room';
  const tone = dark ? 'text-gray-300 hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:bg-black/5 hover:text-gray-900';
  return (
    <div className="meeting-desktop">
      <style>{`
        html, body { overflow: hidden; }
        .meeting-desktop ::-webkit-scrollbar { width: 0; height: 0; }
        .meeting-desktop * { scrollbar-width: none; }
        .meeting-desktop button, .meeting-desktop input, .meeting-desktop label, .meeting-desktop select, .meeting-desktop a, .meeting-desktop textarea, .meeting-desktop [role="dialog"] { -webkit-app-region: no-drag; }
        .desktop-drag { -webkit-app-region: drag; }
      `}</style>
      {children}
      {/*
        After the page, not before it: Electron builds the window's drag area in
        document order, so a drag header that comes later paints over earlier
        no-drag buttons — they looked clickable but only dragged the window.
      */}
      {login && (
        <button
          type="button"
          aria-label="關閉 / Close"
          title="關閉"
          className="fixed right-2.5 top-2.5 z-[1100] flex h-7 w-7 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600"
          onClick={() => window.meetingDesktop?.close()}
        >
          <X size={15} strokeWidth={2} />
        </button>
      )}
      {!login && !compact && (
        <div className="fixed right-0 top-0 z-[1100] flex" style={{ width: DESKTOP_CONTROLS_WIDTH }}>
          <button type="button" aria-label="最小化 / Minimize" className={`${controlClass} ${tone}`} onClick={() => window.meetingDesktop?.minimize()}>
            <Minus size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label={maximized ? '還原 / Restore' : '最大化 / Maximize'}
            className={`${controlClass} ${tone}`}
            onClick={() => window.meetingDesktop?.toggleMaximize?.()}
          >
            {maximized ? <Copy size={13} strokeWidth={1.5} className="-scale-x-100" /> : <Square size={12} strokeWidth={1.5} />}
          </button>
          <button
            type="button"
            aria-label="關閉 / Close"
            className={`${controlClass} ${dark ? 'text-gray-300' : 'text-gray-500'} hover:bg-[#c42b1c] hover:text-white`}
            onClick={() => window.meetingDesktop?.close()}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
};
