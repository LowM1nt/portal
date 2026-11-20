import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Resultado = 'ok' | 'erro' | null

export default function PausarAgente({ cliente }: { cliente: SupabaseClient }) {
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado>(null)

  async function pausar() {
    setEnviando(true)
    setResultado(null)
    try {
      const { error } = await cliente.from('comandos').insert({ comando: 'pausar' })
      setResultado(error ? 'erro' : 'ok')
    } catch {
      setResultado('erro')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grupo-botoes">
      <button type="button" className="botao botao-perigo" disabled={enviando} onClick={() => void pausar()}>
        Pausar agente
      </button>
      {resultado === 'ok' && (
        <p role="status" className="selo selo-ok">
          Comando de pausa enviado.
        </p>
      )}
      {resultado === 'erro' && (
        <p role="alert" className="selo selo-erro">
          Não foi possível enviar o comando de pausa.
        </p>
      )}
    </div>
  )
}
