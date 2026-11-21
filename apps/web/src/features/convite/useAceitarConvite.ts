import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useAvisos } from '../../ui/avisos.ts'
import { erroDoServidor } from '../../ui/useCarregar.ts'
import { convitePendente, guardarConvite } from './convite.ts'

/** Logado e com convite guardado: aceita uma vez, entra no workspace e avisa (toast). */
export function useAceitarConvitePendente() {
  const { estado, api, tentarDeNovo, trocarWorkspace } = useAuth()
  const { avisar } = useAvisos()
  const tentando = useRef(false)

  useEffect(() => {
    if (estado !== 'pronto' || tentando.current) return
    const token = convitePendente()
    if (!token) return
    tentando.current = true
    // Sai do armazenamento antes de chamar: o mesmo convite não é enviado duas vezes.
    guardarConvite(null)
    void (async () => {
      try {
        const r = await api('/api/convites/aceitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (r.ok) {
          const aceito = (await r.json()) as { workspaceId: string; nome: string }
          trocarWorkspace(aceito.workspaceId)
          tentarDeNovo()
          avisar({ tipo: 'ok', titulo: `Bem-vindo ao ${aceito.nome}!`, texto: 'Convite aceito. Você já está no workspace.' })
        } else if (r.status === 409) {
          avisar({ tipo: 'info', titulo: 'Você já faz parte desse workspace', texto: 'É só escolher ele no topo da tela.' })
        } else if (r.status !== 401) {
          const erro = await erroDoServidor(r)
          avisar({ tipo: 'erro', titulo: 'Não deu pra aceitar o convite', texto: erro ?? 'Pede um convite novo pra quem te chamou.' })
        }
      } catch {
        avisar({ tipo: 'erro', titulo: 'Não deu pra aceitar o convite', texto: 'Sem conexão? Abre o link do convite de novo em instantes.' })
      } finally {
        tentando.current = false
      }
    })()
  }, [estado, api, tentarDeNovo, trocarWorkspace, avisar])
}
