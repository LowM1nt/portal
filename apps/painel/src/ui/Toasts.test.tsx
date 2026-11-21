import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAvisoDeErro, useAvisos } from './avisos.ts'
import { ToastProvider } from './Toasts.tsx'

function Botoes() {
  const { avisar } = useAvisos()
  return (
    <>
      <button onClick={() => avisar({ tipo: 'ok', titulo: 'Comando enviado!', texto: 'O agente lê já já.' })}>ok</button>
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
    expect(toast).toHaveTextContent('Comando enviado!')
    expect(toast).toHaveTextContent('O agente lê já já.')
    expect(toast.querySelector('.toast-tempo')).not.toBeNull()
    passar(4999)
    expect(screen.getByText('Comando enviado!')).toBeInTheDocument()
    passar(1)
    expect(screen.queryByText('Comando enviado!')).not.toBeInTheDocument()
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
    expect(toast).toHaveAttribute('role', 'alert')
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
    expect(toasts[0]).toHaveTextContent('Comando enviado!')
    expect(toasts[0].parentElement).toHaveAccessibleName('Avisos')
    // cada aviso é uma região viva: status (ok/info) ou alert (erro)
    expect(toasts.map((t) => t.getAttribute('role'))).toEqual(['status', 'status', 'status'])
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
    expect(screen.getByText('Comando enviado!')).toBeInTheDocument()
    passar(3000)
    expect(screen.queryByText('Comando enviado!')).not.toBeInTheDocument()
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
