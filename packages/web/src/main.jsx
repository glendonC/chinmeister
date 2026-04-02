import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import RenderErrorBoundary from './components/RenderErrorBoundary/RenderErrorBoundary.jsx';
import './app.css';

createRoot(document.getElementById('app')).render(
  <RenderErrorBoundary label="App shell" resetKey="app-root">
    <App />
  </RenderErrorBoundary>,
);
