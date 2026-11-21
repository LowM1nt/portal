import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acompanharSistema, alternarTema, CHAVE_TEMA, definirPreferenciaTema, esquecerTema, temaInicial, useTema } from './tema.ts'

const raiz = document.documentElement

beforeEach(() => {
  window.localStorage.clear()
  raiz.removeAttribute('data-theme')
  esquecerTema()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('tema', () => {
  it('sem escolha salva e sem preferência do sistema, começa no escuro', () => {
    expect(temaInicial()).toBe('escuro')
  })

  it('1ª visita (sem escolha salva) é escuro, mesmo com o sistema no claro', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('light'), media: q }))
    expect(temaInicial()).toBe('escuro')
  })

  it('a escolha “sistema” segue o sistema e fica salva', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('light'), media: q }))
    definirPreferenciaTema('sistema')
    expect(raiz.dataset.theme).toBe('light')
    expect(window.localStorage.getItem(CHAVE_TEMA)).toBe('sistema')
    esquecerTema()
    expect(temaInicial()).toBe('claro')
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }))
    expect(temaInicial()).toBe('escuro')
  })

  it('com “sistema”, acompanha a troca do sistema; com tema fixo, não', () => {
    let claro = false
    const ouvintes: (() => void)[] = []
    vi.stubGlobal('matchMedia', (q: string) => ({
      get matches() {
        return claro && q.includes('light')
      },
      media: q,
      addEventListener: (_: string, f: () => void) => ouvintes.push(f),
      removeEventListener: vi.fn(),
    }))
    const parar = acompanharSistema()
    definirPreferenciaTema('sistema')
    expect(raiz.dataset.theme).toBe('dark')
    claro = true
    ouvintes.forEach((f) => f())
    expect(raiz.dataset.theme).toBe('light')
    definirPreferenciaTema('escuro')
    ouvintes.forEach((f) => f())
    expect(raiz.dataset.theme).toBe('dark')
    parar()
  })

  it('a escolha salva vale mais que o sistema', () => {
    window.localStorage.setItem(CHAVE_TEMA, 'escuro')
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('light'), media: q }))
    expect(temaInicial()).toBe('escuro')
  })

  it('alternar troca o data-theme e persiste a escolha', () => {
    alternarTema()
    expect(raiz.dataset.theme).toBe('light')
    expect(window.localStorage.getItem(CHAVE_TEMA)).toBe('claro')
    alternarTema()
    expect(raiz.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(CHAVE_TEMA)).toBe('escuro')
    esquecerTema()
    expect(temaInicial()).toBe('escuro')
  })

  it('localStorage bloqueado na escrita não quebra: o tema troca mesmo assim', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    expect(() => alternarTema()).not.toThrow()
    expect(raiz.dataset.theme).toBe('light')
  })

  it('localStorage bloqueado na leitura não quebra: cai no escuro', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    expect(temaInicial()).toBe('escuro')
  })

  it('useTema avisa o componente quando o tema muda', () => {
    function Mostra() {
      return <p>{useTema()}</p>
    }
    render(<Mostra />)
    expect(screen.getByText('escuro')).toBeInTheDocument()
    act(() => alternarTema())
    expect(screen.getByText('claro')).toBeInTheDocument()
  })
})
