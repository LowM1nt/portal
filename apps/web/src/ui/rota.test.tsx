import { act, render, screen } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useRota } from './rota.ts'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useRota', () => {
  it('não perde a navegação que acontece entre o desenho e a inscrição dos ouvintes', () => {
    window.history.replaceState(null, '', '/#/inicio')
    function Mostra() {
      const [rota] = useRota()
      // useLayoutEffect roda antes do useEffect que inscreve os ouvintes: o popstate sai sem ninguém ouvindo,
      // igual a um teste (ou um clique) que navega logo depois do 1º desenho.
      useLayoutEffect(() => {
        window.history.pushState(null, '', '#/criar-conta')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, [])
      return <p data-testid="rota">{rota.partes.join('/')}</p>
    }
    render(<Mostra />)
    expect(screen.getByTestId('rota')).toHaveTextContent('criar-conta')
  })

  it('popstate e hashchange depois de montar trocam a rota', () => {
    window.history.replaceState(null, '', '/#/bugs')
    function Mostra() {
      const [rota] = useRota()
      return <p data-testid="rota">{rota.destino}</p>
    }
    render(<Mostra />)
    expect(screen.getByTestId('rota')).toHaveTextContent('bugs')
    act(() => {
      window.history.pushState(null, '', '#/roadmap')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByTestId('rota')).toHaveTextContent('roadmap')
    act(() => {
      window.location.hash = '#/revisoes'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByTestId('rota')).toHaveTextContent('revisoes')
  })
})
