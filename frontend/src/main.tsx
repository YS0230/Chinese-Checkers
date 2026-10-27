import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ClientProvider } from './lib/client';
import { installAudioUnlock } from './lib/sound';
import './index.css';

installAudioUnlock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClientProvider>
      <App />
    </ClientProvider>
  </StrictMode>,
);
