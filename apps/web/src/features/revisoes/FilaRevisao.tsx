import { useEffect, useId, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { buscarFila, type PrRevisao, type StatusCi } from './api.ts'
import { haQuantoTempo } from './tempo.ts'
import { useAvisoDeErro } from '../../ui/avisos.ts'
import { Carregando, EstadoErro, EstadoVazio } from '../../ui/Estados.tsx'
import { IconeRevisoes } from '../../ui/icones.tsx'
import './fila.css'

const CI: Record<StatusCi, { rotulo: string; classe: string }> = {
  sucesso: { rotulo: 'Sucesso', classe: 'selo-ok' },
  falhou: { rotulo: 'Falhou', classe: 'selo-erro' },
  rodando: { rotulo: 'Rodando', classe: 'selo-andamento' },
  'sem CI': { rotulo: 'Sem CI', classe: 'selo-neutro' },
}

type Resultado = { chave: string; lista: PrRevisao[] | null }

export function FilaRevisao() {
  const { api, workspaceAtivo } = useAuth()
  const [tentativa, setTentativa] = useState(0)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [repo, setRepo] = useState('')
  const [revisor, setRevisor] = useState('')
  const id = useId()
  const chave = `${workspaceAtivo?.id ?? ''}#${tentativa}`

  useEffect(() => {
    let ativo = true
    buscarFila(api)
      .then((lista) => ativo && setResultado({ chave, lista }))
      .catch(() => ativo && setResultado({ chave, lista: null }))
    return () => {
      ativo = false
    }
  }, [api, chave])

  const lista = resultado?.chave === chave ? resultado.lista : null
  const pronto = resultado?.chave === chave
  useAvisoDeErro(pronto && lista === null, 'A fila não veio', 'Pode ser a conexão. Dá pra tentar de novo ali na fila.')

  const repositorios = useMemo(() => [...new Set((lista ?? []).map((p) => p.repositorio))].sort(), [lista])
  const revisores = useMemo(() => [...new Set((lista ?? []).flatMap((p) => p.revisores))].sort(), [lista])

  let corpo
  if (!pronto) {
    corpo = (
      <Carregando className="cartao fila-carregando">
        {[0, 1, 2, 3].map((n) => (
          <span key={n} className="osso osso-fila" />
        ))}
      </Carregando>
    )
  } else if (lista === null) {
    corpo = (
      <div className="cartao">
        <EstadoErro
          titulo="Ops, não deu pra carregar a fila de revisão."
          texto="Seus dados estão seguros. Tenta de novo?"
          aoTentar={() => setTentativa((n) => n + 1)}
        />
      </div>
    )
  } else {
    const visiveis = lista.filter(
      (p) => (!repo || p.repositorio === repo) && (!revisor || p.revisores.includes(revisor)),
    )
    const filtrando = Boolean(repo || revisor)
    const agora = new Date()
    corpo =
      visiveis.length === 0 ? (
        <div className="cartao">
          <EstadoVazio
            icone={<IconeRevisoes />}
            titulo="Nenhuma PR esperando revisão"
            texto={filtrando ? 'Nada com esses filtros. Que tal ver tudo?' : 'Fila zerada! Bom trabalho, time.'}
            acao={
              filtrando && (
                <button
                  type="button"
                  className="botao botao-secundario"
                  onClick={() => {
                    setRepo('')
                    setRevisor('')
                  }}
                >
                  Limpar filtros
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="cartao fila">
          <div className="fila-cab" aria-hidden="true">
            <span>Pull request</span>
            <span>Autor</span>
            <span>Revisores</span>
            <span>CI</span>
            <span className="fila-dir">Atualizada</span>
          </div>
          <ul className="fila-lista" aria-label="PRs esperando revisão">
            {visiveis.map((p) => {
              const ci = CI[p.statusCi] ?? CI['sem CI']
              return (
                <li key={`${p.repositorio}#${p.numero}`} className="fila-linha">
                  <span className="fila-pr">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="fila-titulo">
                      {p.titulo}
                    </a>
                    <span className="fila-repo">{p.repositorio}</span>
                  </span>
                  <span className="fila-autor">{p.autor}</span>
                  <span className="fila-revisores">{p.revisores.join(', ') || 'Sem revisor'}</span>
                  <span className="fila-ci">
                    <span className={`selo ${ci.classe}`}>{ci.rotulo}</span>
                  </span>
                  <span className="fila-tempo">{haQuantoTempo(p.atualizadaEm, agora)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )
  }

  return (
    <section className="fila-revisao" aria-label="Fila de revisão">
      {pronto && lista !== null && (
        <div className="fila-filtros">
          <div className="campo">
            <label className="campo-rotulo" htmlFor={`${id}-repo`}>
              Repositório
            </label>
            <select id={`${id}-repo`} className="controle" value={repo} onChange={(e) => setRepo(e.target.value)}>
              <option value="">Todos</option>
              {repositorios.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor={`${id}-revisor`}>
              Revisor
            </label>
            <select
              id={`${id}-revisor`}
              className="controle"
              value={revisor}
              onChange={(e) => setRevisor(e.target.value)}
            >
              <option value="">Todos</option>
              {revisores.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {corpo}
    </section>
  )
}
