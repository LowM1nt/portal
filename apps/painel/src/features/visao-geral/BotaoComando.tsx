import { useRef, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAvisos } from '../../ui/avisos.ts'
import { Confirmar } from '../../ui/Confirmar.tsx'

export type Confirmacao = {
  titulo: string
  texto: ReactNode
  /** Verbo do botão que confirma ("Sim, pausar"). */
  acao: string
  /** Botão que desiste (padrão: "Cancelar"). */
  voltar?: string
}

type Props = {
  cliente: SupabaseClient
  comando: 'pausar' | 'cancelar_post' | 'trocar_perfil'
  args?: Record<string, string>
  onConcluido?: (resultado: 'ok' | 'erro') => void
  rotulo: string
  variante?: string
  icone?: ReactNode
  desativado?: boolean
  /** Toda ação que mexe no agente pede confirmação antes de gravar. */
  confirmacao: Confirmacao
  /** Título do toast de sucesso (e uma frase opcional). */
  ok: string
  okTexto?: string
  /** Título do toast de erro, que não some sozinho. */
  falha: string
}

// Grava um comando em `comandos` (o agente lê e executa) depois da confirmação; o resultado vira toast.
export default function BotaoComando({
  cliente,
  comando,
  args,
  onConcluido,
  rotulo,
  variante,
  icone,
  desativado = false,
  confirmacao,
  ok,
  okTexto,
  falha,
}: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const botao = useRef<HTMLButtonElement>(null)
  const { avisar } = useAvisos()
  const perigo = variante?.includes('botao-perigo') ?? false

  function fechar() {
    setConfirmando(false)
    botao.current?.focus()
  }

  async function enviar() {
    setEnviando(true)
    let deuCerto: boolean
    try {
      const { error } = await cliente.from('comandos').insert(args ? { comando, args } : { comando })
      deuCerto = !error
    } catch {
      deuCerto = false
    }
    setEnviando(false)
    fechar()
    if (deuCerto) avisar({ tipo: 'ok', titulo: ok, texto: okTexto })
    else avisar({ tipo: 'erro', titulo: falha, texto: 'Pode ser a conexão. Confere e tenta de novo daqui a pouco.' })
    onConcluido?.(deuCerto ? 'ok' : 'erro')
  }

  return (
    <>
      <button
        ref={botao}
        type="button"
        className={variante ? `botao ${variante}` : 'botao'}
        disabled={desativado || enviando}
        onClick={() => setConfirmando(true)}
      >
        {icone}
        {rotulo}
      </button>
      {confirmando && (
        <Confirmar
          titulo={confirmacao.titulo}
          texto={confirmacao.texto}
          acao={confirmacao.acao}
          voltar={confirmacao.voltar}
          perigo={perigo}
          ocupado={enviando}
          aoConfirmar={() => void enviar()}
          aoFechar={fechar}
        />
      )}
    </>
  )
}
