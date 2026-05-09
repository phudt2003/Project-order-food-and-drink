import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './adminButtons.css'
import { BrowserRouter } from 'react-router-dom'
import { CategoryStoreProvider } from './store/categoryStore.jsx'
import { API_URLS, pickApiBase } from './config/api.js'
import { AuthProvider } from './store/authStore.jsx'

const Root = () => {
  const [apiUrl, setApiUrl] = React.useState(API_URLS[0] || '')

  React.useEffect(() => {
    let alive = true
    pickApiBase().then((picked) => {
      if (alive && picked) setApiUrl(picked)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <CategoryStoreProvider apiUrl={apiUrl}>
          <App apiBase={apiUrl} />
        </CategoryStoreProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />)
