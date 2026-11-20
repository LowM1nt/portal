import { render, screen } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import VisaoGeral from './VisaoGeral.tsx'

function cliente(linhas: Record<string, unknown[]>, erro = false): SupabaseClient {
  const from = (tabela: string) => {
    const resposta = erro
      ? { data: null, error: { message: 'falhou' } }
      : { data: linhas[tabela] ?? [], error: null }
    const c: unknown = new Proxy(() => {}, {
      get(_a, prop) {
        if (prop === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve(resposta).then(ok)
        return () => c
      },
    })
    return c
  }
  return { from } as unknown as SupabaseClient
}

const eventos = [
  { id: 1, tipo: 'tarefa', item_id: 'P-1', titulo: 'A', projeto: 'Portal', estado: 'merge_feito', tokens: 187000, portao_primeira: true, criado_em: '2026-11-19T01:00:00Z' },
  { id: 2, tipo: 'tarefa', item_id: 'P-2', titulo: 'B', projeto: 'Portal', estado: 'merge_feito', tokens: 203000, portao_primeira: false, criado_em: '2026-11-19T02:00:00Z' },
  { id: 3, tipo: 'tarefa', item_id: 'P-3', titulo: 'C', projeto: 'Portal', estado: 'fila_de_dificeis', tokens: 22000, criado_em: '2026-11-19T03:00:00Z' },
]

function valorDe(rotulo: string) {
  return screen.getByText(rotulo).previousElementSibling?.textContent
}

describe('VisaoGeral: valores e estados', () => {
  it('mostra o valor ao lado de cada número', async () => {
    render(<VisaoGeral cliente={cliente({ eventos })} />)
    await screen.findByText('PRs com merge')
    expect(valorDe('PRs com merge')).toBe('2')
    expect(valorDe('Portões de primeira')).toBe('1 de 3')
    expect(valorDe('Tokens na noite')).toBe('412 mil')
    expect(valorDe('Gasto no mês')).toBe('412 mil tokens')
  })

  it('tokens nulos não viram NaN', async () => {
    const com = [{ ...eventos[0], tokens: null }]
    render(<VisaoGeral cliente={cliente({ eventos: com })} />)
    await screen.findByText('PRs com merge')
    expect(valorDe('Tokens na noite')).toBe('0')
  })

  it('mostra "Pausar agente" também no estado de erro e de carregando', async () => {
    const { unmount } = render(<VisaoGeral cliente={cliente({}, true)} />)
    expect(screen.getByRole('button', { name: 'Pausar agente' })).toBeInTheDocument()
    expect(await screen.findByText(/não foi possível carregar/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pausar agente' })).toBeInTheDocument()
    unmount()
  })
})
