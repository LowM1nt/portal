import { createElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Performance from './Performance.tsx'
import { clienteFalso, type Chamada } from './clienteFalso.ts'

const DIA_MS = 24 * 60 * 60 * 1000

function dosArgs(chamadas: Chamada[], metodo: string) {
  return chamadas.filter((c) => c.metodo === metodo)
}

describe('consulta de performance', () => {
  it('filtra por ts no período de 7 dias e usa limite explícito', async () => {
    const { cliente, chamadas } = clienteFalso({ linhas: [] })
    const antes = Date.now()
    render(createElement(Performance, { cliente }))
    await screen.findByText(/sem (eventos|dados)|nenhum (evento|dado)|ainda não há/i)

    const gte = dosArgs(chamadas, 'gte').find((c) => c.args[0] === 'ts')
    expect(gte).toBeDefined()
    const inicio = Date.parse(String(gte!.args[1]))
    expect(Math.abs(antes - 7 * DIA_MS - inicio)).toBeLessThan(60_000)

    const limite = dosArgs(chamadas, 'limit')[0]
    expect(limite).toBeDefined()
    expect(Number(limite.args[0])).toBeGreaterThan(0)
  })

  it('ao trocar para 30 dias, consulta com o filtro de 30 dias', async () => {
    const usuario = userEvent.setup()
    const { cliente, chamadas } = clienteFalso({ linhas: [] })
    render(createElement(Performance, { cliente }))
    await screen.findByText(/sem (eventos|dados)|nenhum (evento|dado)|ainda não há/i)

    chamadas.length = 0
    const antes = Date.now()
    await usuario.click(screen.getByText(/30 dias/))
    await screen.findByText(/sem (eventos|dados)|nenhum (evento|dado)|ainda não há/i)

    const gte = dosArgs(chamadas, 'gte').find((c) => c.args[0] === 'ts')
    expect(gte).toBeDefined()
    expect(Math.abs(antes - 30 * DIA_MS - Date.parse(String(gte!.args[1])))).toBeLessThan(60_000)
    expect(dosArgs(chamadas, 'limit')[0]).toBeDefined()
  })

  it('pede só os tipos tarefa_metricas, noite_resumo e fallback_acionado', async () => {
    const { cliente, chamadas } = clienteFalso({ linhas: [] })
    render(createElement(Performance, { cliente }))
    await screen.findByText(/sem (eventos|dados)|nenhum (evento|dado)|ainda não há/i)

    const filtro = dosArgs(chamadas, 'in').find((c) => c.args[0] === 'tipo')
    expect(filtro).toBeDefined()
    expect([...(filtro!.args[1] as string[])].sort()).toEqual(['fallback_acionado', 'noite_resumo', 'tarefa_metricas'])
  })
})
