import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Fonts are self-hosted (bundled from @fontsource) — no request to Google Fonts.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/saira-condensed/500.css';
import '@fontsource/saira-condensed/600.css';
import '@fontsource/saira-condensed/700.css';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles/tokens.css';
import './styles/global.css';

import { App } from './app/App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root element not found in index.html');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
