import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@acode/ui';
import { AppProvider } from './state/AppProvider';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider initialMode="dark">
        <AppProvider>
          <App />
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
