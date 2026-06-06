import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { BrowserRouter } from 'react-router'
import AppWrapper from './components/AppWrapper.tsx'

import 'ladda/dist/ladda.min.css'
import 'react-quill-new/dist/quill.bubble.css'
import 'react-quill-new/dist/quill.core.css'
import 'react-quill-new/dist/quill.snow.css'
import 'simplebar-react/dist/simplebar.min.css'

import '@/tailwind.css'
import '@/assets/scss/app.scss'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppWrapper>
        <App />
      </AppWrapper>
    </BrowserRouter>
  </StrictMode>,
)
