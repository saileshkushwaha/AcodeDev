import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@acode/ui';
import { AppProvider } from './state/AppProvider';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider initialMode="dark">
      <AppProvider>
        <App />
      </AppProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
