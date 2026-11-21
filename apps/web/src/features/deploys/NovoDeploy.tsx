import { useCallback, useId, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { chaveDia } from '../calendario/semana.ts'
import type { Deploy } from '../calendario/useDeploysDaSemana.ts'
import { Carregando, EstadoErro, EstadoVazio } from '../../ui/Estados.tsx'
import { IconeRepositorio } from '../../ui/icones.tsx'
import { Painel } from '../../ui/Sobreposicao.tsx'
import { erroDoServidor, lerLista, useCarregar } from '../../ui/useCarregar.ts'
import { AMBIENTES, LIMITES, criarDeploy, instanteDoFormulario, type Repositorio } from './api.ts'

type Props = { aoFechar: () => void; aoCriado: (deploy: Deploy) => void }

const FORM = 'form-novo-deploy'

/** "Novo deploy": painel lateral com título, repositório, dia, hora e ambiente. */
export function NovoDeploy({ aoFechar, aoCriado }: Props) {
  const { api, workspaceAtivo } = useAuth()
  const id = useId()
  const carregar = useCallback(() => lerLista<Repositorio>(api('/api/repositorios')), [api])
  const repos = useCarregar(carregar, workspaceAtivo?.id ?? null)
  const [titulo, setTitulo] = useState('')
  const [repo, setRepo] = useState('')
  const [data, setData] = useState(() => chaveDia(new Date()))
  const [hora, setHora] = useState('16:00')
  const [ambiente, setAmbiente] = useState('producao')
  const [erro, setErro] = useState('')
  const [campoErrado, setCampoErrado] = useState<'titulo' | 'data' | null>(null)
  const [enviando, setEnviando] = useState(false)

  const lista = repos.dados ?? []
  const repoEscolhido = repo || lista[0]?.id || ''

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const t = titulo.trim()
    if (!t) {
      setCampoErrado('titulo')
      return setErro('Dá um título pro deploy. É ele que aparece no calendário.')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) {
      setCampoErrado('data')
      return setErro('Escolhe o dia e a hora do deploy.')
    }
    setErro('')
    setCampoErrado(null)
    setEnviando(true)
    try {
      const r = await criarDeploy(api, { repositorioId: repoEscolhido, titulo: t, ambiente, agendadoPara: instanteDoFormulario(data, hora) })
      if (r.ok) return aoCriado((await r.json()) as Deploy)
      if (r.status === 400) setErro((await erroDoServidor(r)) ?? 'Algum campo não passou na validação. Confere e tenta de novo.')
      else if (r.status !== 401) setErro('Ops, não deu pra criar o deploy. Tenta de novo em instantes.')
    } catch {
      setErro('Ops, não deu pra criar. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  let corpo
  if (repos.estado === 'carregando') {
    corpo = (
      <Carregando className="form-sobre">
        {[0, 1, 2].map((n) => (
          <span key={n} className="osso osso-campo" />
        ))}
      </Carregando>
    )
  } else if (repos.estado === 'erro') {
    corpo = <EstadoErro titulo="Os repositórios não vieram" texto="Sem eles não dá pra marcar o deploy. Tenta de novo?" aoTentar={repos.recarregar} />
  } else if (lista.length === 0) {
    corpo = (
      <EstadoVazio
        icone={<IconeRepositorio />}
        titulo="Nenhum repositório ainda"
        texto="O deploy é sempre de um repositório. Conecte o GitHub e escolha os repositórios em Configurações."
        acao={
          <a className="botao botao-secundario" href="#/config/repositorios" onClick={aoFechar}>
            Ir para Configurações
          </a>
        }
      />
    )
  } else {
    corpo = (
      <form id={FORM} className="form-sobre form-painel" onSubmit={(e) => void enviar(e)} noValidate aria-label="Novo deploy">
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-titulo`}>
            Título
          </label>
          <input
            id={`${id}-titulo`}
            className="controle"
            maxLength={LIMITES.titulo}
            placeholder="Ex.: Filtro por ambiente"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            aria-invalid={campoErrado === 'titulo' ? true : undefined}
            aria-describedby={`${id}-titulo-ajuda`}
          />
          <span id={`${id}-titulo-ajuda`} className="campo-ajuda">
            Aparece no calendário.
          </span>
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-repo`}>
            Repositório
          </label>
          <select id={`${id}-repo`} className="controle mono" value={repoEscolhido} onChange={(e) => setRepo(e.target.value)}>
            {lista.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="duas-colunas">
          <div className="campo">
            <label className="campo-rotulo" htmlFor={`${id}-data`}>
              Dia
            </label>
            <input
              id={`${id}-data`}
              className="controle"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              aria-invalid={campoErrado === 'data' ? true : undefined}
            />
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor={`${id}-hora`}>
              Hora
            </label>
            <input
              id={`${id}-hora`}
              className="controle"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              aria-invalid={campoErrado === 'data' ? true : undefined}
            />
          </div>
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-ambiente`}>
            Ambiente
          </label>
          <select id={`${id}-ambiente`} className="controle" value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
            {Object.entries(AMBIENTES).map(([valor, nome]) => (
              <option key={valor} value={valor}>
                {nome.charAt(0).toUpperCase() + nome.slice(1)}
              </option>
            ))}
          </select>
        </div>
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
      </form>
    )
  }

  const pronto = repos.estado === 'pronto' && lista.length > 0
  return (
    <Painel
      titulo="Novo deploy"
      sobretitulo="Deploys"
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" className="botao botao-fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          {pronto && (
            <button type="submit" form={FORM} className="botao botao-primario" disabled={enviando}>
              {enviando && <span className="giro" aria-hidden="true" />}
              {enviando ? 'Criando…' : 'Criar deploy'}
            </button>
          )}
        </>
      }
    >
      {corpo}
    </Painel>
  )
}
