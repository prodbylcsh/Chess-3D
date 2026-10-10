import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are served with the site, not from Google Fonts: no visitor data goes to Google.
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles/global.css';
import './styles/app.css';
import { App } from './app/App';

// Invite links from before the platform used ?game=ID; route them to the join screen.
const legacy = new URLSearchParams(location.search).get('game');
if (legacy) {
  history.replaceState(null, '', `${location.pathname}#/join/${encodeURIComponent(legacy)}`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
