import { useRef, useState } from 'react';
import { FolderOpen, Music, Plus, Trash2, X } from 'lucide-react';
import { LANG } from '../shared/i18n';
import { fileUrl } from '../shared/files';
import { newId, type CardMedia, type SlideSpec } from '../shared/model';
import { pickFile } from './store';
import { Thumb } from './Thumb';

const text = (en: string, zh: string) => LANG === 'zh' ? zh : en;

export function CardMediaEditor({ spec, tracks, onSave, onClose }: {
  spec: SlideSpec; tracks: CardMedia[]; onSave: (tracks: CardMedia[]) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(tracks));
  const [selected, setSelected] = useState<string | null>(tracks[0]?.id ?? null);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; original: CardMedia; resize: boolean } | null>(null);
  const patch = (id: string, change: Partial<CardMedia>) => setDraft((old) => old.map((track) => track.id === id ? { ...track, ...change } : track));
  const current = draft.find((track) => track.id === selected);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal wide" role="dialog" aria-label={text('Card media', '卡片音视频')} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') onClose(); }}>
      <header><h3>{text('Card media', '卡片音视频')}</h3><div className="spacer" /><button className="icon" onClick={onClose} aria-label={text('Close', '关闭')}><X size={18} /></button></header>
      <div className="modal-body">
        <p className="muted">{text('Only this card. Drag video to move; drag its corner to resize. Zero size hides the picture while keeping sound.', '仅应用于这一张卡片。拖动视频移动位置，拖动右下角缩放；大小为 0 时隐藏画面，声音继续播放。')}</p>
        <div className="media-editor-canvas" ref={canvas}>
          <Thumb spec={spec} large />
          {draft.filter((track) => track.kind === 'video' && track.w > 0 && track.h > 0).map((track) => <div key={track.id}
            className={`media-edit-box${selected === track.id ? ' selected' : ''}`}
            style={{ left: `${track.x * 100}%`, top: `${track.y * 100}%`, width: `${track.w * 100}%`, height: `${track.h * 100}%` }}
            onPointerDown={(event) => {
              event.preventDefault(); setSelected(track.id); event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { id: track.id, x: event.clientX, y: event.clientY, original: { ...track }, resize: (event.target as HTMLElement).classList.contains('media-resize') };
            }}
            onPointerMove={(event) => {
              const start = drag.current; const bounds = canvas.current?.getBoundingClientRect();
              if (!start || !bounds) return;
              const dx = (event.clientX - start.x) / bounds.width; const dy = (event.clientY - start.y) / bounds.height;
              patch(start.id, start.resize ? { w: Math.max(0, start.original.w + dx), h: Math.max(0, start.original.h + dy) } : { x: start.original.x + dx, y: start.original.y + dy });
            }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
            {track.url.trim() && <video src={fileUrl(track.url)} muted preload="auto" onLoadedMetadata={(event) => { event.currentTarget.currentTime = .001; }} />}
            <span className="media-resize" />
          </div>)}
        </div>
        <div className="row media-add">
          {(['audio', 'video'] as const).map((kind) => <button key={kind} onClick={() => {
            const track: CardMedia = { id: newId(), kind, url: '', x: .1, y: .1, w: .5, h: .5, volume: 1, startSeconds: 0, loop: false };
            setDraft((old) => [...old, track]); setSelected(track.id);
          }}><Plus size={15} />{kind === 'audio' ? text('Add audio', '添加音频') : text('Add video', '添加视频')}</button>)}
        </div>
        <div className="row media-track-list">{draft.map((track, index) => <button key={track.id} className={selected === track.id ? 'on' : ''} onClick={() => setSelected(track.id)}><Music size={14} />{track.fileName || `${track.kind} ${index + 1}`}</button>)}</div>
        {current && <div className="form">
          <label>{text('File or URL', '文件或网址')}<div className="row">
            <input value={current.url} onChange={(event) => patch(current.id, { url: event.target.value, fileHash: undefined, fileName: undefined })} />
            <button onClick={async () => { try { const url = await pickFile(current.kind); if (url) patch(current.id, { url, fileHash: undefined, fileName: undefined }); } catch (error: unknown) { setError(String(error)); } }}><FolderOpen size={15} /></button>
            <button title={text('Remove', '删除')} onClick={() => { setDraft((old) => old.filter((track) => track.id !== current.id)); setSelected(null); }}><Trash2 size={15} /></button>
          </div></label>
          {current.kind === 'video' && <>
            <label>{text('Video size (0 = hidden)', '视频大小（0 = 隐藏）')}<input type="range" min="0" max="200" value={current.w * 100} onChange={(event) => { const w = Number(event.target.value) / 100; patch(current.id, { w, h: current.w > 0 ? current.h * w / current.w : w }); }} /></label>
            <div className="media-coordinates">{(['x', 'y', 'w', 'h'] as const).map((key) => <label key={key}>{({ x: 'X %', y: 'Y %', w: text('Width %', '宽度 %'), h: text('Height %', '高度 %') })[key]}<input type="number" min={key === 'w' || key === 'h' ? 0 : undefined} step="1" value={Math.round(current[key] * 100)} onChange={(event) => patch(current.id, { [key]: (key === 'w' || key === 'h' ? Math.max(0, Number(event.target.value)) : Number(event.target.value)) / 100 })} /></label>)}</div>
          </>}
          <label>{text('Volume', '音量')}<input type="range" min="0" max="100" value={current.volume * 100} onChange={(event) => patch(current.id, { volume: Number(event.target.value) / 100 })} /></label>
          <label>{text('Start at (seconds)', '起始时间（秒）')}<input type="number" min="0" value={current.startSeconds} onChange={(event) => patch(current.id, { startSeconds: Math.max(0, Number(event.target.value)) })} /></label>
          <label className="check"><input type="checkbox" checked={current.loop} onChange={(event) => patch(current.id, { loop: event.target.checked })} />{text('Loop', '循环播放')}</label>
        </div>}
        {error && <p className="error">{error}</p>}
      </div>
      <footer><button onClick={onClose}>{text('Cancel', '取消')}</button><button className="primary" onClick={() => { if (draft.some((track) => !track.url.trim())) { setError(text('Choose a file or enter a URL for each track.', '请为每个音视频选择文件或填写网址。')); return; } onSave(draft); }}>{text('Save', '保存')}</button></footer>
    </div>
  </div>;
}
