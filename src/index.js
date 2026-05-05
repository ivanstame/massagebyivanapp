import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import './index.css';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';

// MUST create root before using it
const root = createRoot(document.getElementById('root'));

// Top-level ErrorBoundary catches render exceptions anywhere in the
// tree and shows a recoverable UI instead of leaving the user with
// a blank white page.
root.render(
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
);