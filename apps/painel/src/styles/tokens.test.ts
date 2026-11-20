import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import componentes from './components.css?raw'
import tokens from './tokens.css?raw'
import entrada from '../main.tsx?raw'

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

describe('tokens do Madrugada', () => {
  it('usa o tema escuro quando não há data-theme', () => {
    expect(valor('--noite')).toBe('#313338')
    expect(valor('--texto')).toBe('#f2f3f5')
  })

  it('troca para o tema claro com data-theme="light"', () => {
    raiz.setAttribute('data-theme', 'light')
    expect(valor('--noite')).toBe('#faf8ff')
    expect(valor('--texto')).toBe('#1b1530')
  })

  it('volta para o tema escuro ao remover data-theme="light"', () => {
    raiz.setAttribute('data-theme', 'light')
    raiz.removeAttribute('data-theme')
    expect(valor('--noite')).toBe('#313338')
    expect(valor('--texto')).toBe('#f2f3f5')
  })

  it('carrega tokens.css e components.css no ponto de entrada', () => {
    expect(tokens.length).toBeGreaterThan(0)
    expect(componentes.length).toBeGreaterThan(0)
    expect(entrada).toMatch(/import\s+['"]\.\/styles\/tokens\.css['"]/)
    expect(entrada).toMatch(/import\s+['"]\.\/styles\/components\.css['"]/)
  })
})
