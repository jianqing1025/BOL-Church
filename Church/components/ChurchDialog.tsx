import React, { useEffect, useState } from 'react';

type DialogKind = 'alert' | 'confirm' | 'prompt' | 'permission';

interface DialogRequest {
  id: number;
  kind: DialogKind;
  message: string;
  defaultValue?: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (value: boolean | string | null) => void;
}

let nextDialogId = 1;
let pushDialog: ((request: DialogRequest) => void) | null = null;

type DialogOptions = Pick<DialogRequest, 'title' | 'confirmLabel' | 'cancelLabel'>;

const requestDialog = (kind: DialogKind, message: string, defaultValue?: string, options: DialogOptions = {}) => new Promise<boolean | string | null>((resolve) => {
  const request: DialogRequest = { id: nextDialogId++, kind, message, defaultValue, ...options, resolve };
  if (pushDialog) pushDialog(request);
  else resolve(kind === 'confirm' || kind === 'permission' ? false : kind === 'prompt' ? null : true);
});

export const churchAlert = async (message: string): Promise<void> => {
  await requestDialog('alert', message);
};

export const churchConfirm = async (message: string): Promise<boolean> => {
  return await requestDialog('confirm', message) === true;
};

export const churchPermissionConfirm = async (message: string, options: DialogOptions = {}): Promise<boolean> => {
  return await requestDialog('permission', message, undefined, options) === true;
};

export const churchPrompt = async (message: string, defaultValue = ''): Promise<string | null> => {
  const result = await requestDialog('prompt', message, defaultValue);
  return typeof result === 'string' ? result : null;
};

export const ChurchDialogHost: React.FC = () => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [promptValue, setPromptValue] = useState('');
  const active = queue[0] || null;

  useEffect(() => {
    pushDialog = (request) => setQueue((current) => [...current, request]);
    return () => { pushDialog = null; };
  }, []);

  useEffect(() => {
    setPromptValue(active?.defaultValue || '');
  }, [active?.id, active?.defaultValue]);

  if (!active) return null;

  const close = (value: boolean | string | null) => {
    active.resolve(value);
    setQueue((current) => current.slice(1));
  };

  const title = active.title ?? (active.kind === 'confirm' || active.kind === 'permission' ? 'Please Confirm' : active.kind === 'prompt' ? active.message : 'Notice');
  const confirmLabel = active.confirmLabel ?? (active.kind === 'alert' ? 'OK' : 'Confirm');
  const cancelLabel = active.cancelLabel ?? 'Cancel';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 px-4 py-6">
      <div className="w-full max-w-md rounded-[10px] bg-white p-7 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-lg font-black text-rose-500">
            {active.kind === 'permission' ? '!' : 'B'}
          </div>
          <h2 className="text-xl font-extrabold text-gray-800">{title}</h2>
        </div>
        {active.kind !== 'prompt' && <p className="mb-6 whitespace-pre-wrap text-sm leading-6 text-gray-600">{active.message}</p>}
        {active.kind === 'prompt' && (
          <input
            autoFocus
            value={promptValue}
            onChange={(event) => setPromptValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') close(promptValue);
              if (event.key === 'Escape') close(null);
            }}
            className="mb-6 h-12 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-gray-700 outline-none transition-colors focus:border-rose-400"
          />
        )}
        <div className="flex justify-end gap-2">
          {active.kind !== 'alert' && (
            <button type="button" onClick={() => close(active.kind === 'prompt' ? null : false)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50">
              {cancelLabel}
            </button>
          )}
          <button type="button" onClick={() => close(active.kind === 'prompt' ? promptValue : true)} className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white hover:bg-rose-600">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
