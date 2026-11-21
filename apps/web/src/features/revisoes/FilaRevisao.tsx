import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { buscarFila, type PrRevisao, type StatusCi } from './api.ts'
import { haQuantoTempo } from './tempo.ts'

const CI: Record<StatusCi, { rotulo: string; classe: string }> = {
  sucesso: { rotulo: 'Sucesso', classe: 'selo-ok' },
  falhou: { rotulo: 'Falhou', classe: 'selo-erro' },
  rodando: { rotulo: 'Rodando', classe: 'selo-atencao' },
  'sem CI': { rotulo: 'Sem CI', classe: '' },
}

const quebra = { minWidth: 0, overflowWrap: 'anywhere' } as const

type Resultado = { chave: string; lista: PrRevisao[] | null }

export function FilaRevisao() {
  const { api, workspaceAtivo } = useAuth()
  const [tentativa, setTentativa] = useState(0)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [repo, setRepo] = useState('')
  const [revisor, setRevisor] = useState('')
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

  const repositorios = useMemo(() => [...new Set((lista ?? []).map((p) => p.repositorio))].sort(), [lista])
  const revisores = useMemo(() => [...new Set((lista ?? []).flatMap((p) => p.revisores))].sort(), [lista])

  let corpo
  if (!pronto) {
    corpo = (
      <p className="suave" aria-busy="true">
        Carregando…
      </p>
    )
  } else if (lista === null) {
    corpo = (
      <div>
        <p role="alert" className="selo selo-erro" style={{ height: 'auto', whiteSpace: 'normal' }}>
          Não foi possível carregar a fila de revisão.
        </p>
        <button type="button" className="botao botao-primario" onClick={() => setTentativa((n) => n + 1)}>
          Tentar de novo
        </button>
      </div>
    )
  } else {
    const visiveis = lista.filter(
      (p) => (!repo || p.repositorio === repo) && (!revisor || p.revisores.includes(revisor)),
    )
    const agora = new Date()
    corpo =
      visiveis.length === 0 ? (
        <p className="vazio">Nenhuma PR esperando revisão</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--e-3)' }}>
          {visiveis.map((p) => {
            const ci = CI[p.statusCi] ?? CI['sem CI']
            return (
              <li
                key={`${p.repositorio}#${p.numero}`}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--e-2) var(--e-3)', alignItems: 'center', ...quebra }}
              >
                <a href={p.url} target="_blank" rel="noopener noreferrer" style={quebra}>
                  {p.titulo}
                </a>
                <span className="suave" style={quebra}>
                  {p.repositorio}
                </span>
                <span className="suave" style={quebra}>
                  {p.autor}
                </span>
                <span className="suave" style={quebra}>
                  {p.revisores.join(', ')}
                </span>
                <span className={`selo ${ci.classe}`.trim()}>{ci.rotulo}</span>
                <span className="suave">{haQuantoTempo(p.atualizadaEm, agora)}</span>
              </li>
            )
          })}
        </ul>
      )
  }

  return (
    <section className="painel" aria-label="Fila de revisão" style={quebra}>
      <header style={{ flexWrap: 'wrap' }}>
        <h2>Fila de revisão</h2>
      </header>
      {pronto && lista !== null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--e-3)' }}>
          <label className="campo" style={{ minWidth: 0, flex: '1 1 140px' }}>
            Repositório
            <select value={repo} onChange={(e) => setRepo(e.target.value)}>
              <option value="">Todos</option>
              {repositorios.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="campo" style={{ minWidth: 0, flex: '1 1 140px' }}>
            Revisor
            <select value={revisor} onChange={(e) => setRevisor(e.target.value)}>
              <option value="">Todos</option>
              {revisores.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {corpo}
    </section>
  )
}
