import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAvisoDeErro, useAvisos } from './avisos.ts'
import { ToastProvider } from './Toasts.tsx'

function Botoes() {
  const { avisar } = useAvisos()
  return (
    <>
      <button onClick={() => avisar({ tipo: 'ok', titulo: 'Deploy criado!', texto: 'Já tá no calendário.' })}>ok</button>
      <button onClick={() => avisar({ tipo: 'erro', titulo: 'Ops, falhou' })}>erro</button>
      <button onClick={() => avisar({ tipo: 'info', titulo: 'Aviso' })}>info</button>
    </>
  )
}

const passar = (ms: number) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Toasts', () => {
  it('aviso comum some sozinho em 5 s e tem a barrinha de tempo', () => {
    render(
      <ToastProvider>
        <Botoes />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('ok'))
    const toast = screen.getByTestId('toast')
    expect(toast).toHaveTextContent('Deploy criado!')
    expect(toast).toHaveTextContent('Já tá no calendário.')
    expect(toast.querySelector('.toast-tempo')).not.toBeNull()
    passar(4999)
    expect(screen.getByText('Deploy criado!')).toBeInTheDocument()
    passar(1)
    expect(screen.queryByText('Deploy criado!')).not.toBeInTheDocument()
  })

  it('erro não some sozinho (nem barrinha) e fecha no X', () => {
    render(
      <ToastProvider>
        <Botoes />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('erro'))
    passar(60_000)
    const toast = screen.getByTestId('toast')
    expect(toast).toHaveTextContent('Ops, falhou')
    expect(toast.querySelector('.toast-tempo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument()
  })

  it('fica no canto numa região anunciada e guarda no máximo 3, o mais novo em cima', () => {
    render(
      <ToastProvider>
        <Botoes />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('erro'))
    fireEvent.click(screen.getByText('ok'))
    fireEvent.click(screen.getByText('info'))
    fireEvent.click(screen.getByText('ok'))
    const toasts = screen.getAllByTestId('toast')
    expect(toasts).toHaveLength(3)
    expect(toasts[0]).toHaveTextContent('Deploy criado!')
    expect(toasts[0].parentElement).toHaveAttribute('aria-live', 'polite')
  })

  it('com "reduzir movimento" o aviso fica um pouco mais (8 s), como no guia', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }))
    render(
      <ToastProvider>
        <Botoes />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('ok'))
    passar(5000)
    expect(screen.getByText('Deploy criado!')).toBeInTheDocument()
    passar(3000)
    expect(screen.queryByText('Deploy criado!')).not.toBeInTheDocument()
  })

  it('useAvisoDeErro mantém o toast enquanto o erro existe e tira quando passa', () => {
    function Tela() {
      const [erro, setErro] = useState(true)
      useAvisoDeErro(erro, 'Não carregou', 'Tenta de novo.')
      return <button onClick={() => setErro(false)}>resolver</button>
    }
    render(
      <ToastProvider>
        <Tela />
      </ToastProvider>,
    )
    passar(10_000)
    expect(screen.getAllByText('Não carregou')).toHaveLength(1)
    fireEvent.click(screen.getByText('resolver'))
    expect(screen.queryByText('Não carregou')).not.toBeInTheDocument()
  })

  it('sem provedor, avisar não quebra a tela', () => {
    render(<Botoes />)
    fireEvent.click(screen.getByText('ok'))
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument()
  })
})
