import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alternarTema, CHAVE_TEMA, esquecerTema, temaInicial, useTema } from './tema.ts'

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

  it('sem escolha salva, respeita o sistema que prefere claro', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('light'), media: q }))
    expect(temaInicial()).toBe('claro')
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
