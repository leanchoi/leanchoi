import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ProveedorApp } from './state/app';
import './styles/tokens.css';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorApp>
      <App />
    </ProveedorApp>
  </StrictMode>,
);
