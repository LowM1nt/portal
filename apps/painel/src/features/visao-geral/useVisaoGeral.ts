import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Tarefa = {
  id: number
  item_id: string
  titulo: string
  projeto: string
  estado: string
  tokens: number
  portao_primeira?: boolean
  criado_em: string
}

type Evento = {
  id: number
  tipo: string
  texto?: string
  publica_em?: string
  tokens?: number
  criado_em: string
  [campo: string]: unknown
}

export type DadosVisaoGeral = {
  tarefas: Tarefa[]
  proximoPost: { texto: string; publicaEm: string | null } | null
  precisaDeVoce: string[]
  gastoNoMes: number
  sincronizadoEm: string | null
}

export type EstadoVisaoGeral =
  | { situacao: 'carregando' }
  | { situacao: 'erro' }
  | { situacao: 'pronto'; dados: DadosVisaoGeral }

const JANELA_DA_NOITE_MS = 12 * 60 * 60 * 1000

export function montarDados(eventos: Evento[], sincronizadoEm: string | null): DadosVisaoGeral {
  const ordenados = [...eventos].sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  const ultimo = ordenados.at(-1)
  if (!ultimo) return { tarefas: [], proximoPost: null, precisaDeVoce: [], gastoNoMes: 0, sincronizadoEm }

  const fim = Date.parse(ultimo.criado_em)
  const mes = ultimo.criado_em.slice(0, 7)
  const daNoite = ordenados.filter((e) => fim - Date.parse(e.criado_em) <= JANELA_DA_NOITE_MS)
  const post = daNoite.findLast((e) => e.tipo === 'proximo_post')

  return {
    tarefas: daNoite.filter((e) => e.tipo === 'tarefa') as unknown as Tarefa[],
    proximoPost: post ? { texto: post.texto ?? '', publicaEm: post.publica_em ?? null } : null,
    precisaDeVoce: daNoite.filter((e) => e.tipo === 'precisa_de_voce').map((e) => e.texto ?? ''),
    gastoNoMes: ordenados
      .filter((e) => e.tipo === 'tarefa' && e.criado_em.startsWith(mes))
      .reduce((soma, e) => soma + (e.tokens ?? 0), 0),
    sincronizadoEm,
  }
}

export function useVisaoGeral(cliente: SupabaseClient): EstadoVisaoGeral {
  const [estado, setEstado] = useState<EstadoVisaoGeral>({ situacao: 'carregando' })

  useEffect(() => {
    let ativo = true
    async function carregar() {
      // RLS do Supabase restringe as linhas ao dono; aqui só pedimos o recorte recente.
      const [eventos, sync] = await Promise.all([
        cliente.from('eventos').select('*').order('criado_em', { ascending: false }).limit(500),
        cliente.from('sincronizacao').select('*').order('sincronizado_em', { ascending: false }).limit(1),
      ])
      if (!ativo) return
      if (eventos.error || sync.error) {
        setEstado({ situacao: 'erro' })
        return
      }
      const linhaSync = (sync.data as { sincronizado_em: string }[] | null)?.[0]
      setEstado({
        situacao: 'pronto',
        dados: montarDados((eventos.data as Evento[] | null) ?? [], linhaSync?.sincronizado_em ?? null),
      })
    }
    carregar().catch(() => {
      if (ativo) setEstado({ situacao: 'erro' })
    })
    return () => {
      ativo = false
    }
  }, [cliente])

  return estado
}
