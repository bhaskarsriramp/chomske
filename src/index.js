import { hydrate, render } from 'react-dom';
import './index.css';
import './styles/bootstrap.css';
import App from './App.js';
import store from './store/store.js';
import reportWebVitals from './reportWebVitals.js';
import { Provider } from 'react-redux';
import getSubdomain from './Utils/getSubdomain.js';
import { SnackbarProvider } from './components/Employee/SnackbarProvider.js';

// Read server-injected initial profile if present
let initialProfile = null;
try {
  if (typeof window !== 'undefined' && window.__INITIAL_PROFILE__) {
    // If server injected a JSON object, it should already be a JS object.
    // If it was injected as a string for any reason, try to parse safely.
    const injected = window.__INITIAL_PROFILE__;
    initialProfile = typeof injected === 'string' ? JSON.parse(injected) : injected;
  }
} catch (err) {
  // If parsing fails, ignore and continue without initial profile.
  console.warn('Failed to parse window.__INITIAL_PROFILE__', err);
  initialProfile = null;
}

// Extract subdomain (e.g. sid4real from sid4real.chomske.com)
const initialSubdomain = (typeof window !== 'undefined') ? getSubdomain(window.location.hostname) : null;

const rootElement = document.getElementById('root');

const AppTree = (
  <Provider store={store}>
    <SnackbarProvider>
    <App initialSubdomain={initialSubdomain} initialProfile={initialProfile} />
  </SnackbarProvider>

  </Provider>
);

// Support react-snap hydration
if (rootElement.hasChildNodes()) {
  hydrate(AppTree, rootElement);
} else {
  render(AppTree, rootElement);
}

// Optional: Performance metrics
reportWebVitals();
