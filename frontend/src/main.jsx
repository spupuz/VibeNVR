import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.jsx'

import { BrowserRouter } from 'react-router'

// Global Fetch Interceptor for Federation Proxy
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    
    // Check if there is an active federated node selected
    if (
        window.__ACTIVE_NODE_ID && 
        typeof resource === 'string' && 
        resource.startsWith('/api/') && 
        !resource.startsWith('/api/federation') &&
        !resource.startsWith('/api/health') &&
        !resource.startsWith('/api/auth')
    ) {
        // Rewrite the URL to point to the backend proxy
        resource = `/api/federation/proxy/${window.__ACTIVE_NODE_ID}${resource.substring(4)}`;
    }
    
    return originalFetch(resource, config);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
