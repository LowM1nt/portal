import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import VisaoGeral from './VisaoGeral.tsx'
import { clienteContrato, type Opcoes } from '../../test/clienteContrato.ts'

const ha = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

const noiteReal: Opcoes['linhas'] = {
  eventos: [
    { id: 1, ts: '2026-11-19T04:19:00Z', tipo: 'tarefa_metricas', origem: 'agente', dados: { item: 'P-012', resultado: 'pr_aberta', perfil: 'principal', tentativas: 1, requisicoes: 20, tokens_entrada: 150000, tokens_saida: 37000, segundos_modelo: 900, custo_usd: 0, modelos: ['m'] } },
    { id: 2, ts: '2026-11-19T05:53:00Z', tipo: 'tarefa_metricas', origem: 'agente', dados: { item: 'P-013', resultado: 'pr_aberta', perfil: 'principal', tentativas: 1, requisicoes: 22, tokens_entrada: 160000, tokens_saida: 43000, segundos_modelo: 950, custo_usd: 0, modelos: ['m'] } },
    { id: 3, ts: '2026-11-19T07:00:00Z', tipo: 'noite_resumo', origem: 'agente', dados: { prs: 2, reprovadas: 0, fila_dificeis: 1, fallbacks: 0, quedas: 1, minutos_fora: 12, perfil: 'principal', requisicoes: 42, tokens_entrada: 310000, tokens_saida: 80000 } },
  ],
  sincronizacao: [{ ultima_vez: ha(5) }],
  posts: [{ id: 7, texto: 'Meu agente implementou o calendário de deploys do portal esta noite.', publicar_em: new Date(Date.now() + 86_400_000).toISOString() }],
}

describe('VisaoGeral pelo contrato', () => {
  it('com uma noite real, mostra título, linha da noite, 4 números, tabela e a última sincronização', async () => {
    const { cliente, limites } = clienteContrato({ linhas: noiteReal })
    const { container } = render(<VisaoGeral cliente={cliente} />)

    expect(await screen.findByRole('heading', { level: 1, name: /Noite de \d+ para \d+ de novembro/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Linha da noite' })).toBeInTheDocument()
    expect(container.querySelectorAll('.grade-4 .painel.numero')).toHaveLength(4)
    for (const rotulo of ['PRs abertas', 'Portões de primeira', 'Tokens na noite', 'Gasto no mês']) {
      expect(screen.getByText(rotulo)).toBeInTheDocument()
    }
    expect(screen.getByText('390 mil')).toBeInTheDocument()

    const tabela = screen.getByRole('table')
    expect(tabela).toHaveClass('tabela')
    expect(within(tabela).getByText(/P-012/)).toBeInTheDocument()
    expect(within(tabela).getByText(/P-013/)).toBeInTheDocument()

    expect(screen.getByText(/última sincronização/i).parentElement).toHaveTextContent(/há 5 min/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/undefined|NaN/)).not.toBeInTheDocument()
    // toda consulta em eventos tem limite explícito
    expect(limites.some((l) => l.tabela === 'eventos')).toBe(true)
  })

  it('mostra o próximo post vindo de posts', async () => {
    const { cliente } = clienteContrato({ linhas: noiteReal })
    render(<VisaoGeral cliente={cliente} />)
    const post = await screen.findByRole('region', { name: 'Próximo post' })
    expect(within(post).getByText(/calendário de deploys do portal/)).toBeInTheDocument()
  })

  it('com noite vazia, mostra o estado vazio sem erro', async () => {
    const { cliente } = clienteContrato({ linhas: { eventos: [], sincronizacao: [], posts: [] } })
    render(<VisaoGeral cliente={cliente} />)
    expect(await screen.findByText(/nenhuma atividade/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('com noite vazia, ainda mostra a sincronização e o próximo post', async () => {
    const { cliente } = clienteContrato({
      linhas: { eventos: [], sincronizacao: [{ ultima_vez: ha(3) }], posts: [{ id: 1, texto: 'Post futuro', publicar_em: new Date(Date.now() + 3_600_000).toISOString() }] },
    })
    render(<VisaoGeral cliente={cliente} />)
    expect(await screen.findByText(/nenhuma atividade/i)).toBeInTheDocument()
    expect(screen.getByText(/última sincronização/i).parentElement).toHaveTextContent(/há 3 min/)
    expect(within(screen.getByRole('region', { name: 'Próximo post' })).getByText('Post futuro')).toBeInTheDocument()
  })

  it('mostra o erro do botão quando a gravação do comando falha', async () => {
    const usuario = userEvent.setup()
    const { cliente } = clienteContrato({ linhas: noiteReal, erroInsert: true })
    render(<VisaoGeral cliente={cliente} />)
    await usuario.click(await screen.findByRole('button', { name: 'Cancelar post' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível cancelar/i)
    await usuario.click(screen.getByRole('button', { name: 'Pausar agente' }))
    await waitFor(() => expect(screen.getByText(/não foi possível enviar o comando de pausa/i)).toBeInTheDocument())
  })

  it('carregando, erro e "Tentar de novo" que volta para carregando e refaz a consulta', async () => {
    const usuario = userEvent.setup()
    const opcoes: Opcoes = { erro: true }
    const { cliente, from } = clienteContrato(opcoes)
    render(<VisaoGeral cliente={cliente} />)

    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível/i)
    const chamadasAntes = from.mock.calls.length

    opcoes.erro = false
    opcoes.pendente = true
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(from.mock.calls.length).toBeGreaterThan(chamadasAntes)
  })

  it('"Tentar de novo" mostra os dados quando a consulta volta a funcionar', async () => {
    const usuario = userEvent.setup()
    const opcoes: Opcoes = { erro: true, linhas: noiteReal }
    const { cliente } = clienteContrato(opcoes)
    render(<VisaoGeral cliente={cliente} />)
    await usuario.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    opcoes.erro = false
    await usuario.click(screen.queryByRole('button', { name: 'Tentar de novo' }) ?? document.body)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Linha da noite' })).toBeInTheDocument())
  })

  it('"Cancelar post" grava cancelar_post em comandos e "Pausar agente" grava a pausa', async () => {
    const usuario = userEvent.setup()
    const { cliente, inserts } = clienteContrato({ linhas: noiteReal })
    render(<VisaoGeral cliente={cliente} />)

    await usuario.click(await screen.findByRole('button', { name: 'Cancelar post' }))
    await waitFor(() => expect(inserts).toHaveLength(1))
    expect(inserts[0].tabela).toBe('comandos')
    expect(inserts[0].valor.comando).toBe('cancelar_post')

    await usuario.click(screen.getByRole('button', { name: 'Pausar agente' }))
    await waitFor(() => expect(inserts).toHaveLength(2))
    expect(inserts[1].tabela).toBe('comandos')
    expect(inserts[1].valor.comando).toBe('pausar')
  })

  it('os botões usam só as classes do design system e o cabeçalho quebra linha', async () => {
    const { cliente } = clienteContrato({ linhas: noiteReal })
    const { container } = render(<VisaoGeral cliente={cliente} />)
    const pausar = await screen.findByRole('button', { name: 'Pausar agente' })
    expect([...pausar.classList].sort()).toEqual(['botao', 'botao-perigo'])
    const cancelar = screen.getByRole('button', { name: 'Cancelar post' })
    expect(cancelar).toHaveClass('botao')
    for (const b of container.querySelectorAll('button')) {
      expect(b.getAttribute('style')).toBeNull()
    }
    const cabecalho = container.querySelector('.cabecalho')
    expect(cabecalho).not.toBeNull()
    expect(cabecalho?.getAttribute('style') ?? '').not.toMatch(/width|nowrap/)
    expect(cabecalho).toContainElement(pausar)
  })
})
