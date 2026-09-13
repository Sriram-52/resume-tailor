import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { installDevApi } from './devApi'
import './index.css'

// Outside Electron there is no preload bridge, so back the UI with fixtures.
// Inside the app this returns immediately and changes nothing.
installDevApi()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
