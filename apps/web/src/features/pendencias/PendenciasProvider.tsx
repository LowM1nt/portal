import { useCallback, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import type { Bug } from '../bugs/api.ts'
import { buscarFila } from '../revisoes/api.ts'
import { lerLista, useCarregar } from '../../ui/useCarregar.ts'
import { PendenciasContexto } from './pendencias.ts'

/** Carrega uma vez por workspace o que a casca inteira usa (contadores, Início, Bugs). */
export function PendenciasProvider({ children }: { children: ReactNode }) {
  const { api, estado, workspaceAtivo } = useAuth()
  const escopo = estado === 'pronto' && workspaceAtivo ? workspaceAtivo.id : null
  const carregarBugs = useCallback(() => lerLista<Bug>(api('/api/bugs')), [api])
  const carregarRevisoes = useCallback(() => buscarFila(api), [api])
  const bugs = useCarregar(carregarBugs, escopo)
  const revisoes = useCarregar(carregarRevisoes, escopo)
  return <PendenciasContexto.Provider value={{ bugs, revisoes }}>{children}</PendenciasContexto.Provider>
}
