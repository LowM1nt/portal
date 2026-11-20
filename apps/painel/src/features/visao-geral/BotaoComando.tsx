import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Resultado = 'ok' | 'erro' | null

type Props = {
  cliente: SupabaseClient
  comando: 'pausar' | 'cancelar_post' | 'trocar_perfil'
  args?: Record<string, string>
  grupo?: string
  onConcluido?: (resultado: 'ok' | 'erro') => void
  rotulo: string
  variante?: string
  ok: string
  falha: string
}

// Grava um comando em `comandos`; o agente lê e executa.
export default function BotaoComando({ cliente, comando, args, grupo = 'grupo-botoes', onConcluido, rotulo, variante, ok, falha }: Props) {
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado>(null)

  async function enviar() {
    setEnviando(true)
    setResultado(null)
    try {
      const { error } = await cliente.from('comandos').insert(args ? { comando, args } : { comando })
      setResultado(error ? 'erro' : 'ok')
      onConcluido?.(error ? 'erro' : 'ok')
    } catch {
      setResultado('erro')
      onConcluido?.('erro')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className={grupo}>
      <button
        type="button"
        className={variante ? `botao ${variante}` : 'botao'}
        disabled={enviando}
        onClick={() => void enviar()}
      >
        {rotulo}
      </button>
      {resultado === 'ok' && (
        <p role="status" className="selo selo-ok">
          {ok}
        </p>
      )}
      {resultado === 'erro' && (
        <p role="alert" className="selo selo-erro">
          {falha}
        </p>
      )}
    </div>
  )
}
