import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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
