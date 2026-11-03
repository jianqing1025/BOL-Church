import { createRoot } from 'react-dom/client';
import { App } from './App';
import './panel.css';

// The text size OBS is set to (Settings ▸ Appearance ▸ font size), passed in the address.
const fontScale = Number(new URLSearchParams(location.search).get('font'));
if (fontScale > 0) document.documentElement.style.setProperty('--obs-font', String(fontScale));

createRoot(document.getElementById('root')!).render(<App />);
