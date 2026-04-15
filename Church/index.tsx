import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './context/LanguageContext';
import { AdminProvider } from './context/AdminContext';

const analyticsToken = import.meta.env.VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN;
if (analyticsToken) {
  const script = document.createElement('script');
  script.defer = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.setAttribute('data-cf-beacon', JSON.stringify({ token: analyticsToken }));
  document.head.appendChild(script);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <AdminProvider>
        <App />
      </AdminProvider>
    </LanguageProvider>
  </React.StrictMode>
);
