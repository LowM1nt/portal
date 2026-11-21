import { useCallback, useState } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import type { Deploy } from '../calendario/useDeploysDaSemana.ts'
import { useAvisos } from '../../ui/avisos.ts'
import { Carregando, EstadoErro } from '../../ui/Estados.tsx'
import { Painel } from '../../ui/Sobreposicao.tsx'
import { erroDoServidor, lerLista, useCarregar } from '../../ui/useCarregar.ts'
import { AMBIENTES, STATUS_DEPLOY, mudarStatusDeploy, obterDeploy, type Repositorio, type StatusDeploy } from './api.ts'

type Props = { id: string; aoFechar: () => void; aoMudar: (deploy: Deploy) => void }

type Passo = { status: Exclude<StatusDeploy, 'cancelado'>; rotulo: string; carregando: string; classe: string }

const CONCLUIDO: Passo = { status: 'concluido', rotulo: 'Marcar como concluído', carregando: 'Salvando…', classe: 'botao-primario' }
const FALHOU: Passo = { status: 'falhou', rotulo: 'Falhou', carregando: 'Salvando…', classe: 'botao-perigo' }
const DESFAZER: Passo = { status: 'agendado', rotulo: 'Voltar para agendado', carregando: 'Voltando…', classe: 'botao-secundario' }

const AVISO: Record<Passo['status'], { titulo: string; texto: string }> = {
  concluido: { titulo: 'Deploy concluído!', texto: 'Já conta nas métricas do time.' },
  falhou: { titulo: 'Anotado: o deploy falhou', texto: 'Entra na taxa de falha. Quando corrigir, marca o próximo como concluído.' },
  agendado: { titulo: 'Voltou para agendado', texto: 'Saiu das métricas até você marcar como foi.' },
}

const dataHora = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

/** Detalhe do deploy: quando, repositório, ambiente e marcar como foi (concluído ou falhou). */
export function PainelDeploy({ id, aoFechar, aoMudar }: Props) {
  const { api, workspaceAtivo } = useAuth()
  const { avisar } = useAvisos()
  const [movendo, setMovendo] = useState<Passo['status'] | null>(null)
  const carregar = useCallback(async () => {
    const [deploy, repos] = await Promise.all([obterDeploy(api, id), lerLista<Repositorio>(api('/api/repositorios')).catch(() => [])])
    return { deploy, repos }
  }, [api, id])
  const recurso = useCarregar(carregar, workspaceAtivo ? `${workspaceAtivo.id}#${id}` : null)

  async function mover(passo: Passo) {
    setMovendo(passo.status)
    try {
      const r = await mudarStatusDeploy(api, id, passo.status)
      if (r.ok) {
        const novo = (await r.json()) as Deploy
        recurso.definir((atual) => ({ ...atual, deploy: novo }))
        aoMudar(novo)
        avisar({ tipo: 'ok', ...AVISO[passo.status] })
      } else if (r.status !== 401) {
        const erro = await erroDoServidor(r)
        avisar({ tipo: 'erro', titulo: 'Não deu pra mudar o status', texto: erro ?? 'Tenta de novo em instantes.' })
      }
    } catch {
      avisar({ tipo: 'erro', titulo: 'Não deu pra mudar o status', texto: 'Sem conexão? Tenta de novo em instantes.' })
    } finally {
      setMovendo(null)
    }
  }

  if (recurso.estado === 'carregando') {
    return (
      <Painel titulo="Carregando o deploy…" sobretitulo="Deploy" aoFechar={aoFechar}>
        <Carregando className="form-sobre">
          {[0, 1, 2].map((n) => (
            <span key={n} className="osso osso-campo" />
          ))}
        </Carregando>
      </Painel>
    )
  }
  if (recurso.estado === 'erro' || !recurso.dados) {
    return (
      <Painel titulo="Ops, o deploy não veio" sobretitulo="Deploy" aoFechar={aoFechar}>
        <EstadoErro titulo="Não deu pra abrir o deploy" texto="Seus dados estão seguros. Tenta de novo?" aoTentar={recurso.recarregar} />
      </Painel>
    )
  }

  const { deploy, repos } = recurso.dados
  if (!deploy) {
    return (
      <Painel
        titulo="Esse deploy não está aqui"
        sobretitulo="Deploy"
        aoFechar={aoFechar}
        rodape={
          <button type="button" className="botao botao-secundario" onClick={aoFechar}>
            Voltar pro calendário
          </button>
        }
      >
        <p className="suave">O link pode estar velho, ou o deploy é de outro workspace. Confere o workspace ativo no topo da tela.</p>
      </Painel>
    )
  }

  const st = STATUS_DEPLOY[deploy.status] ?? STATUS_DEPLOY.agendado
  const repo = repos.find((r) => r.id === deploy.repositorioId)?.nome
  const passos = deploy.status === 'agendado' ? [FALHOU, CONCLUIDO] : deploy.status === 'cancelado' ? [] : [DESFAZER]

  return (
    <Painel
      titulo={deploy.titulo}
      sobretitulo="Deploy"
      aoFechar={aoFechar}
      rodape={
        <>
          {passos.map((p) => (
            <button key={p.status} type="button" className={`botao ${p.classe}`} disabled={movendo !== null} onClick={() => void mover(p)}>
              {movendo === p.status && <span className="giro" aria-hidden="true" />}
              {movendo === p.status ? p.carregando : p.rotulo}
            </button>
          ))}
        </>
      }
    >
      <dl className="meta">
        <dt>Status</dt>
        <dd>
          <span className={`selo ${st.classe}`}>{st.nome}</span>
        </dd>
        <dt>Quando</dt>
        <dd>{dataHora.format(new Date(deploy.agendadoPara))}</dd>
        <dt>Repositório</dt>
        <dd className="mono">{repo ?? 'Repositório removido'}</dd>
        <dt>Ambiente</dt>
        <dd>{AMBIENTES[deploy.ambiente] ?? deploy.ambiente}</dd>
      </dl>
      <p className="nota">
        {deploy.status === 'agendado'
          ? 'Depois que o deploy acontecer, marca aqui como foi. Só deploys concluídos ou que falharam entram nas métricas.'
          : deploy.status === 'cancelado'
            ? 'Este deploy foi cancelado e não entra nas métricas.'
            : 'Marcou errado? Dá pra voltar para agendado.'}
      </p>
    </Painel>
  )
}
