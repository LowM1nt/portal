/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import componentes from './components.css?raw'
import tokens from './tokens.css?raw'
import entrada from '../main.tsx?raw'
import pagina from '../../index.html?raw'
import cabecalhos from '../../public/_headers?raw'

const raiz = document.documentElement
let estilo: HTMLStyleElement

const valor = (token: string) => getComputedStyle(raiz).getPropertyValue(token).trim()

beforeEach(() => {
  estilo = document.createElement('style')
  estilo.textContent = tokens
  document.head.appendChild(estilo)
  raiz.removeAttribute('data-theme')
})

afterEach(() => {
  estilo.remove()
  raiz.removeAttribute('data-theme')
})

describe('tokens do Releasy no painel', () => {
  it('são a cópia fiel de docs/ui/tokens.css (fonte única de verdade)', () => {
    expect(tokens).toBe(readFileSync('../../docs/ui/tokens.css', 'utf8'))
  })

  it('usa o tema escuro "Aurora berinjela" quando não há data-theme', () => {
    expect(valor('--fundo')).toBe('#110b1b')
    expect(valor('--texto')).toBe('#f5effb')
    expect(valor('--roxo')).toBe('#9b4dff')
  })

  it('troca para o tema claro com data-theme="light"', () => {
    raiz.setAttribute('data-theme', 'light')
    expect(valor('--fundo')).toBe('#f7f4fc')
    expect(valor('--texto')).toBe('#1a1225')
  })

  it('volta para o tema escuro com data-theme="dark"', () => {
    raiz.setAttribute('data-theme', 'light')
    raiz.setAttribute('data-theme', 'dark')
    expect(valor('--fundo')).toBe('#110b1b')
    expect(valor('--texto')).toBe('#f5effb')
  })

  it('carrega tokens.css e components.css no ponto de entrada e a fonte Inter no index.html', () => {
    expect(tokens.length).toBeGreaterThan(0)
    expect(componentes.length).toBeGreaterThan(0)
    expect(entrada).toMatch(/import\s+['"]\.\/styles\/tokens\.css['"]/)
    expect(entrada).toMatch(/import\s+['"]\.\/styles\/components\.css['"]/)
    expect(pagina).toMatch(/fonts\.googleapis\.com\/css2\?family=Inter/)
    // CSP script-src 'self': nada de script inline na página.
    expect(pagina).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
  })

  it('a CSP do painel continua com script-src só do próprio site e libera a fonte do Google', () => {
    const csp = cabecalhos.match(/Content-Security-Policy:\s*(.+)/)?.[1] ?? ''
    expect(csp).toMatch(/script-src 'self';/)
    expect(csp).toMatch(/style-src [^;]*https:\/\/fonts\.googleapis\.com/)
    expect(csp).toMatch(/font-src [^;]*https:\/\/fonts\.gstatic\.com/)
  })

  it('o fundo Aurora anda só com transform e para com "reduzir movimento"', () => {
    const quadros = componentes.match(/@keyframes deriva-[ab]\s*\{[^}]*\}\s*\}/g) ?? []
    expect(quadros).toHaveLength(2)
    for (const q of quadros) expect(q.replace(/@keyframes[^{]+\{/, '')).toMatch(/^\s*to\s*\{\s*transform:[^;]+;\s*\}\s*\}$/)
    expect(componentes).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.aurora i/)
  })

  it('toda animação mexe só em transform/opacity', () => {
    const quadros = componentes.match(/@keyframes [\w-]+\s*\{(?:[^{}]*\{[^}]*\})+\s*\}/g) ?? []
    expect(quadros.length).toBeGreaterThan(5)
    for (const q of quadros) {
      const propriedades = [...q.replace(/@keyframes[^{]+\{/, '').matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      for (const p of propriedades) expect(['transform', 'opacity']).toContain(p)
    }
  })
})
