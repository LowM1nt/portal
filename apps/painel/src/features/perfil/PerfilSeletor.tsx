import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import BotaoComando from '../visao-geral/BotaoComando.tsx'

type Perfis = { ativo: string; disponiveis: string[] }

// Mostra o perfil ativo e grava `trocar_perfil` em `comandos` depois da confirmação.
export default function PerfilSeletor({ cliente }: { cliente: SupabaseClient }) {
  const [perfis, setPerfis] = useState<Perfis | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [erro, setErro] = useState(false)
  const [escolhido, setEscolhido] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    let ativo = true
    Promise.resolve(cliente.from('sincronizacao').select('perfil_ativo, perfis_disponiveis').maybeSingle())
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) return setErro(true)
        const linha = data as {
          perfil_ativo?: string | null
          perfis_disponiveis?: string[] | null
        } | null
        setPerfis({
          ativo: linha?.perfil_ativo ?? '',
          disponiveis: linha?.perfis_disponiveis ?? [],
        })
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

  if (erro) {
    return (
      <div className="perfil">
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

  return (
    <div className="perfil">
      <span className="selo">{perfis.ativo || 'sem perfil'}</span>
      <span className="campo">
        <select
          aria-label="Perfil de modelos"
          value={escolhido}
          disabled={confirmando}
          onChange={(e) => {
            setEscolhido(e.target.value)
            setEnviado(false)
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
      </span>
      {!confirmando && (
        <button
          type="button"
          className="botao"
          disabled={!escolhido || escolhido === perfis.ativo}
          onClick={() => setConfirmando(true)}
        >
          Trocar perfil
        </button>
      )}
      {confirmando && (
        <>
          <span className="suave pequeno linha-cheia">
            O agente passa a usar o perfil {escolhido} a partir da próxima tarefa.
          </span>
          {
            <BotaoComando
              cliente={cliente}
              comando="trocar_perfil"
              args={{ perfil: escolhido }}
              grupo="perfil-acao"
              rotulo="Confirmar"
              variante="botao-primario"
              ok="Pedido enviado. O perfil muda na próxima sincronização."
              falha="Não foi possível enviar o pedido."
              onConcluido={(r) => {
                if (r === 'ok') {
                  setEnviado(true)
                  setTentativa((n) => n + 1)
                }
              }}
            />
          }
          <button type="button" className="botao botao-quieto" onClick={() => setConfirmando(false)}>
            {enviado ? 'Fechar' : 'Cancelar'}
          </button>
        </>
      )}
    </div>
  )
}
