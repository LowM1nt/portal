import { useEffect, useId, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import BotaoComando from '../visao-geral/BotaoComando.tsx'
import { Carregando } from '../../ui/Estados.tsx'

type Perfis = { ativo: string; disponiveis: string[] }

// Mostra o perfil ativo e grava `trocar_perfil` em `comandos` depois da confirmação (modal).
export default function PerfilSeletor({ cliente }: { cliente: SupabaseClient }) {
  const [perfis, setPerfis] = useState<Perfis | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [erro, setErro] = useState(false)
  const [escolhido, setEscolhido] = useState('')
  const id = useId()

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
        <button type="button" className="botao botao-secundario botao-p" onClick={() => carregar()}>
          Tentar de novo
        </button>
      </div>
    )
  }
  if (!perfis) {
    return (
      <Carregando className="perfil" rotulo="Carregando perfil…">
        <span className="osso osso-perfil" />
      </Carregando>
    )
  }

  return (
    <div className="perfil">
      <label className="perfil-rotulo" htmlFor={`${id}-perfil`}>
        Perfil de modelos
      </label>
      <span className="selo selo-andamento" title="Perfil ativo">
        {perfis.ativo || 'sem perfil'}
      </span>
      <select
        id={`${id}-perfil`}
        className="controle controle-p"
        value={escolhido}
        onChange={(e) => setEscolhido(e.target.value)}
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
      <BotaoComando
        cliente={cliente}
        comando="trocar_perfil"
        args={{ perfil: escolhido }}
        rotulo="Trocar perfil"
        variante="botao-secundario botao-p"
        desativado={!escolhido || escolhido === perfis.ativo}
        confirmacao={{
          titulo: 'Trocar o perfil de modelos?',
          texto: `O agente passa a usar o perfil ${escolhido} a partir da próxima tarefa.`,
          acao: 'Confirmar troca',
        }}
        ok="Pedido de troca enviado"
        okTexto="O perfil muda na próxima sincronização."
        falha="Não foi possível enviar o pedido de troca."
        onConcluido={(r) => {
          if (r === 'ok') {
            setEscolhido('')
            setTentativa((n) => n + 1)
          }
        }}
      />
    </div>
  )
}
