import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import ContentHub from './ContentHub';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <ContentHub />
  </React.StrictMode>
);