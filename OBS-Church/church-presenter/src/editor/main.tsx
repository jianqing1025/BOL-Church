import { createRoot } from 'react-dom/client';
import { setFilePicker, setHostFactory } from '../panel/store';
import '../panel/panel.css';
import './editor.css';
import { cloudHost, pickAndUpload } from './cloud';
import { EditorApp } from './EditorApp';

// The slide area talks to the account instead of OBS, and files are uploaded instead of picked from a disk.
setHostFactory(cloudHost);
setFilePicker(pickAndUpload);

createRoot(document.getElementById('root')!).render(<EditorApp />);
