import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Perfis = { ativo: string; disponiveis: string[] }
type Resultado = 'ok' | 'erro' | null

// Mostra o perfil ativo e grava `trocar_perfil` em `comandos` depois da confirmação.
export default function PerfilSeletor({ cliente }: { cliente: SupabaseClient }) {
  const [perfis, setPerfis] = useState<Perfis | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [erro, setErro] = useState(false)
  const [escolhido, setEscolhido] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado>(null)

  useEffect(() => {
    let ativo = true
    Promise.resolve(cliente.from('sincronizacao').select('perfil_ativo, perfis_disponiveis').maybeSingle())
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) return setErro(true)
        const linha = data as { perfil_ativo?: string | null; perfis_disponiveis?: string[] | null } | null
        setPerfis({ ativo: linha?.perfil_ativo ?? '', disponiveis: linha?.perfis_disponiveis ?? [] })
      })
      .catch(() => {
        if (ativo) setErro(true)
      })
    return () => {
      ativo = false
    }
  }, [cliente, tentativa])

  function carregar() {
    setErro(false)
    setPerfis(null)
    setTentativa((n) => n + 1)
  }

  async function confirmar() {
    setEnviando(true)
    try {
      const { error } = await cliente.from('comandos').insert({ comando: 'trocar_perfil', args: { perfil: escolhido } })
      setResultado(error ? 'erro' : 'ok')
    } catch {
      setResultado('erro')
    } finally {
      setEnviando(false)
      setConfirmando(false)
    }
  }

  if (erro) {
    return (
      <div className="grupo-botoes">
        <p role="alert" className="selo selo-erro">
          Não foi possível carregar o perfil.
        </p>
        <button type="button" className="botao" onClick={() => carregar()}>
          Tentar de novo
        </button>
      </div>
    )
  }
  if (!perfis) return <p className="suave pequeno">Carregando perfil…</p>

  const outros = perfis.disponiveis.filter((p) => p !== perfis.ativo)
  return (
    <div className="grupo-botoes">
      <span className="selo">{perfis.ativo || 'sem perfil'}</span>
      <select
        aria-label="Perfil de modelos"
        value={escolhido}
        disabled={confirmando}
        onChange={(e) => {
          setEscolhido(e.target.value)
          setResultado(null)
        }}
      >
        <option value="" disabled>
          Escolher perfil
        </option>
        {perfis.disponiveis.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {!confirmando && (
        <button
          type="button"
          className="botao"
          disabled={!escolhido || escolhido === perfis.ativo || !outros.includes(escolhido)}
          onClick={() => setConfirmando(true)}
        >
          Trocar perfil
        </button>
      )}
      {confirmando && (
        <>
          <span className="suave pequeno">O agente passa a usar o perfil {escolhido} a partir da próxima tarefa.</span>
          <button type="button" className="botao botao-primario" disabled={enviando} onClick={() => void confirmar()}>
            Confirmar
          </button>
          <button type="button" className="botao botao-quieto" disabled={enviando} onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
        </>
      )}
      {resultado === 'ok' && (
        <p role="status" className="selo selo-ok">
          Pedido enviado. O perfil muda na próxima sincronização.
        </p>
      )}
      {resultado === 'erro' && (
        <p role="alert" className="selo selo-erro">
          Não foi possível enviar o pedido.
        </p>
      )}
    </div>
  )
}
