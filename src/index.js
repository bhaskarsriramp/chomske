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

// Support react-snap hydration
if (rootElement.hasChildNodes()) {
  hydrate(AppTree, rootElement);
} else {
  render(AppTree, rootElement);
}

// Optional: Performance metrics
reportWebVitals();
