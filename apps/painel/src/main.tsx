import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/components.css'
import App from './App.tsx'
import { aplicarTema, temaInicial } from './ui/tema.ts'

const raiz = document.getElementById('root')
if (!raiz) {
  throw new Error('Elemento #root não encontrado no index.html.')
}

// Antes do primeiro desenho, para não piscar o tema errado (sem script inline: a CSP não deixa).
aplicarTema(temaInicial())

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
