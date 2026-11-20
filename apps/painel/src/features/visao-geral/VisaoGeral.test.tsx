import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import VisaoGeral from './VisaoGeral.tsx'

type Linhas = Record<string, unknown[]>
type Resposta = { data: unknown; error: { message: string } | null }

// Cliente falso: qualquer encadeamento (select/order/limit/eq/gte…) termina numa resposta
// por tabela, então o teste não depende de como a consulta é montada.
function clienteFalso(opcoes: {
  linhas?: Linhas
  erroConsulta?: boolean
  pendente?: boolean
  erroInsert?: boolean
}) {
  const insert = vi.fn(async (): Promise<Resposta> => {
    if (opcoes.erroInsert) return { data: null, error: { message: 'falhou' } }
    return { data: null, error: null }
  })
  const from = vi.fn((tabela: string) => {
    const resposta = (): Promise<Resposta> => {
      if (opcoes.pendente) return new Promise(() => {})
      if (opcoes.erroConsulta) return Promise.resolve({ data: null, error: { message: 'falhou' } })
      return Promise.resolve({ data: opcoes.linhas?.[tabela] ?? [], error: null })
    }
    const construtor: unknown = new Proxy(() => {}, {
      get(_alvo, prop) {
        if (prop === 'insert') return insert
        if (prop === 'then') return (ok: (v: Resposta) => unknown, ko?: (e: unknown) => unknown) => resposta().then(ok, ko)
        if (prop === 'maybeSingle' || prop === 'single') {
          return () =>
            resposta().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }))
        }
        return () => construtor
      },
    })
    return construtor
  })
  return { cliente: { from } as unknown as SupabaseClient, from, insert }
}

const noite: Linhas = {
  eventos: [
    { id: 1, tipo: 'tarefa', item_id: 'P-012', titulo: 'Listar deploys da semana', projeto: 'Portal', estado: 'merge_feito', tokens: 187000, criado_em: '2026-11-19T01:19:00Z' },
    { id: 2, tipo: 'tarefa', item_id: 'P-013', titulo: 'Estado vazio do calendário', projeto: 'Portal', estado: 'merge_feito', tokens: 203000, criado_em: '2026-11-19T02:53:00Z' },
    { id: 3, tipo: 'tarefa', item_id: 'P-019', titulo: 'Status de CI em tempo real', projeto: 'Portal', estado: 'fila_de_dificeis', tokens: 22000, criado_em: '2026-11-19T03:34:00Z' },
    { id: 4, tipo: 'proximo_post', texto: 'Meu agente implementou o calendário de deploys do portal esta noite.', publica_em: '2026-11-19T12:00:00Z', criado_em: '2026-11-19T03:57:00Z' },
    { id: 5, tipo: 'precisa_de_voce', texto: 'Token do LinkedIn vence em 9 dias', criado_em: '2026-11-19T03:58:00Z' },
  ],
  sincronizacao: [{ id: 1, sincronizado_em: '2026-11-19T04:12:00Z' }],
}

describe('VisaoGeral', () => {
  it('com dados de uma noite, mostra a linha da noite, os 4 números, as tarefas, o próximo post e "precisa de você"', async () => {
    const { cliente } = clienteFalso({ linhas: noite })
    render(<VisaoGeral cliente={cliente} />)

    expect(await screen.findByRole('region', { name: 'Linha da noite' })).toBeInTheDocument()

    for (const rotulo of ['PRs com merge', 'Portões de primeira', 'Tokens na noite', 'Gasto no mês']) {
      expect(screen.getByText(rotulo)).toBeInTheDocument()
    }

    const tarefas = screen.getByRole('region', { name: 'Tarefas da noite' })
    expect(within(tarefas).getByText(/Listar deploys da semana/)).toBeInTheDocument()
    expect(within(tarefas).getByText(/Estado vazio do calendário/)).toBeInTheDocument()
    expect(within(tarefas).getByText(/Status de CI em tempo real/)).toBeInTheDocument()

    const post = screen.getByRole('region', { name: 'Próximo post' })
    expect(within(post).getByText(/calendário de deploys do portal/)).toBeInTheDocument()

    const precisa = screen.getByRole('region', { name: 'Precisa de você' })
    expect(within(precisa).getByText('Token do LinkedIn vence em 9 dias')).toBeInTheDocument()
  })

  it('com noite vazia, mostra o estado vazio em português em vez de números ou listas quebradas', async () => {
    const { cliente } = clienteFalso({ linhas: { eventos: [], sincronizacao: [] } })
    render(<VisaoGeral cliente={cliente} />)

    expect(await screen.findByText(/nenhuma atividade/i)).toBeInTheDocument()
    expect(screen.queryByText('Tokens na noite')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText(/undefined|NaN|null/)).not.toBeInTheDocument()
  })

  it('enquanto os dados carregam, mostra o estado de carregando', () => {
    const { cliente } = clienteFalso({ pendente: true })
    render(<VisaoGeral cliente={cliente} />)
    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
    expect(screen.queryByText('PRs com merge')).not.toBeInTheDocument()
  })

  it('se a consulta falha, mostra mensagem de erro', async () => {
    const { cliente } = clienteFalso({ erroConsulta: true })
    render(<VisaoGeral cliente={cliente} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível|erro/i)
    expect(screen.queryByText('PRs com merge')).not.toBeInTheDocument()
  })

  it('mostra o horário da última sincronização vindo da tabela sincronizacao', async () => {
    const { cliente, from } = clienteFalso({ linhas: noite })
    render(<VisaoGeral cliente={cliente} />)
    const rotulo = await screen.findByText(/última sincronização/i)
    expect(rotulo).toBeInTheDocument()
    expect(from).toHaveBeenCalledWith('sincronizacao')
    // o horário aparece junto do rótulo (04h12 em UTC ou no fuso local, o importante é ter hora)
    expect(rotulo.parentElement?.textContent).toMatch(/\d{1,2}[h:]\d{2}/)
  })

  it('clicar em "Pausar agente" insere um registro na tabela comandos com o comando de pausa', async () => {
    const usuario = userEvent.setup()
    const { cliente, from, insert } = clienteFalso({ linhas: noite })
    render(<VisaoGeral cliente={cliente} />)

    await usuario.click(await screen.findByRole('button', { name: 'Pausar agente' }))

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    expect(from).toHaveBeenCalledWith('comandos')
    const gravado = JSON.stringify(insert.mock.calls[0])
    expect(gravado).toMatch(/paus/i)
    expect(await screen.findByRole('status')).toHaveTextContent(/paus/i)
  })

  it('se a gravação do comando falha, mostra erro', async () => {
    const usuario = userEvent.setup()
    const { cliente } = clienteFalso({ linhas: noite, erroInsert: true })
    render(<VisaoGeral cliente={cliente} />)

    await usuario.click(await screen.findByRole('button', { name: 'Pausar agente' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível|erro|falh/i)
  })
})
