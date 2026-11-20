import { describe, expect, it } from 'vitest'
import { buscarVisaoGeral } from './dados.ts'
import { clienteContrato } from '../../test/clienteContrato.ts'

const metricas = (id: number, ts: string, item: string, resultado: string, tentativas: number) => ({
  id,
  ts,
  tipo: 'tarefa_metricas',
  origem: 'agente',
  dados: { item, resultado, tentativas, tokens_entrada: 100, tokens_saida: 50, segundos_modelo: 600 },
})

describe('buscarVisaoGeral', () => {
  it('monta a noite a partir do noite_resumo mais recente e das tarefa_metricas da janela', async () => {
    const { cliente, limites } = clienteContrato({
      linhas: {
        eventos: [
          { id: 1, ts: '2026-11-10T07:00:00Z', tipo: 'noite_resumo', dados: { prs: 9 } },
          metricas(2, '2026-11-19T03:00:00Z', 'P-1', 'pr_aberta', 1),
          metricas(3, '2026-11-19T05:00:00Z', 'P-2', 'reprovada', 2),
          { id: 4, ts: '2026-11-19T07:00:00Z', tipo: 'noite_resumo', dados: { prs: 1, fila_dificeis: 2, reprovadas: 1, minutos_fora: 5 } },
        ],
        sincronizacao: [{ ultima_vez: '2026-11-19T07:05:00Z' }],
      },
    })
    const d = await buscarVisaoGeral(cliente)
    expect(d?.prs).toBe(1)
    expect(d?.filaDificeis).toBe(2)
    expect(d?.tarefas.map((t) => t.item)).toEqual(['P-1', 'P-2'])
    expect(d?.tokensDaNoite).toBe(300)
    expect(d?.sincronizadoEm).toBe('2026-11-19T07:05:00Z')
    expect(d?.proximoPost).toBeNull()
    expect(limites.every((l) => l.limite !== undefined)).toBe(true)
  })

  it('próximo post é o futuro mais próximo, ignorando o já publicado', async () => {
    const agora = Date.now()
    const h = (n: number) => new Date(agora + n * 3_600_000).toISOString()
    const { cliente } = clienteContrato({
      linhas: {
        eventos: [],
        posts: [
          { id: 1, texto: 'passado', publicar_em: h(-24) },
          { id: 2, texto: 'longe', publicar_em: h(48) },
          { id: 3, texto: 'perto', publicar_em: h(2) },
        ],
      },
    })
    expect((await buscarVisaoGeral(cliente)).proximoPost?.texto).toBe('perto')
  })

  it('sem noite_resumo devolve noiteTs nulo, mantendo sincronização e post; erro da consulta vira exceção', async () => {
    const vazio = await buscarVisaoGeral(
      clienteContrato({ linhas: { eventos: [], sincronizacao: [{ ultima_vez: '2026-11-19T07:05:00Z' }] } }).cliente,
    )
    expect(vazio.noiteTs).toBeNull()
    expect(vazio.sincronizadoEm).toBe('2026-11-19T07:05:00Z')
    await expect(buscarVisaoGeral(clienteContrato({ erro: true }).cliente)).rejects.toThrow()
  })
})
