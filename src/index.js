import { hydrate, render } from 'react-dom';
import './index.css';
import './styles/bootstrap.css';
import App from './App.js';
import store from './store/store.js';
import reportWebVitals from './reportWebVitals.js';
import { Provider } from 'react-redux';

const rootElement = document.getElementById('root');

const AppTree = (
  <Provider store={store}>
    <App />
  </Provider>
);

// Routes react-snap actually pre-renders — keep this in sync with
// reactSnap.include in package.json. Any other path (every /professional/*
// app route included) falls back to nginx serving the root build/index.html,
// which react-snap overwrites with the "/" page's markup. That markup doesn't
// match what App() renders for those paths, so hydrating onto it corrupts the
// DOM instead of replacing it — those paths need a clean render() instead.
const PRERENDERED_PATHS = new Set([
  "/", "/pricing", "/about-us", "/contact", "/terms", "/privacy-policy",
  "/refund-cancellation-policy", "/shipping-policy", "/google-api-disclosure",
  "/disclosure-policy", "/trust-center", "/youtube_api_disclosure", "/security",
  "/personalised-user-tone", "/schedule-publish", "/save-time",
]);

if (rootElement.hasChildNodes() && PRERENDERED_PATHS.has(window.location.pathname)) {
  hydrate(AppTree, rootElement);
} else {
  render(AppTree, rootElement);
}

// Optional: Performance metrics
reportWebVitals();
