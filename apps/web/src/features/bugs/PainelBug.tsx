import { useState } from 'react'
import { haQuantoTempo } from '../revisoes/tempo.ts'
import { Painel } from '../../ui/Sobreposicao.tsx'
import { SEVERIDADES, STATUS, type Bug, type StatusBug } from './api.ts'

type Props = {
  /** `null`: o link aponta para um bug que não existe (ou é de outro workspace). */
  bug: Bug | null
  aoFechar: () => void
  aoMover: (bug: Bug, status: StatusBug) => Promise<void>
}

type Passo = { status: StatusBug; rotulo: string; carregando: string }

/** Próximo passo (botão primário) e alternativa (secundário) de cada status. */
function passos(status: StatusBug): { principal: Passo | null; outro: Passo | null } {
  const comecar = { status: 'em_andamento', rotulo: 'Começar a resolver', carregando: 'Movendo…' } as const
  const resolver = { status: 'resolvido', rotulo: 'Marcar como resolvido', carregando: 'Salvando…' } as const
  const descartar = { status: 'descartado', rotulo: 'Descartar', carregando: 'Descartando…' } as const
  const triagem = { status: 'a_triar', rotulo: 'Voltar pra triagem', carregando: 'Movendo…' } as const
  const reabrir = { status: 'a_triar', rotulo: 'Reabrir', carregando: 'Reabrindo…' } as const
  if (status === 'a_triar') return { principal: comecar, outro: descartar }
  if (status === 'aberto' || status === 'em_andamento') return { principal: resolver, outro: triagem }
  return { principal: null, outro: reabrir }
}

const dataHora = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Texto({ valor, vazio }: { valor: string; vazio: string }) {
  return valor.trim() ? <div className="citacao">{valor}</div> : <div className="citacao citacao-vazia">{vazio}</div>
}

/** Detalhe do bug no painel lateral: relato original, passos, esperado × obtido e mover de status. */
export function PainelBug({ bug, aoFechar, aoMover }: Props) {
  const [movendo, setMovendo] = useState<StatusBug | null>(null)

  if (!bug) {
    return (
      <Painel
        titulo="Esse bug não está aqui"
        aoFechar={aoFechar}
        rodape={
          <button type="button" className="botao botao-secundario" onClick={aoFechar}>
            Voltar pra lista
          </button>
        }
      >
        <p className="suave">O link pode estar velho, ou o bug é de outro workspace. Confere o workspace ativo no topo da tela.</p>
      </Painel>
    )
  }

  const { principal, outro } = passos(bug.status)
  const sev = SEVERIDADES[bug.severidade] ?? SEVERIDADES.media
  const st = STATUS[bug.status] ?? STATUS.a_triar

  async function mover(status: StatusBug) {
    if (!bug) return
    setMovendo(status)
    try {
      await aoMover(bug, status)
    } finally {
      setMovendo(null)
    }
  }

  const botao = (p: Passo, classe: string) => (
    <button type="button" className={`botao ${classe}`} disabled={movendo !== null} onClick={() => void mover(p.status)}>
      {movendo === p.status && <span className="giro" aria-hidden="true" />}
      {movendo === p.status ? p.carregando : p.rotulo}
    </button>
  )

  return (
    <Painel
      titulo={bug.titulo}
      sobretitulo={`Bug · ${bug.origem === 'discord' ? 'Discord' : 'Relatado pelo time'}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" className="botao botao-fantasma empurra so-desk" onClick={aoFechar}>
            Fechar
          </button>
          {outro && botao(outro, 'botao-secundario')}
          {principal && botao(principal, 'botao-primario')}
        </>
      }
    >
      <dl className="meta">
        <dt>Severidade</dt>
        <dd>
          <span className={`selo ${sev.classe}`}>{sev.nome}</span>
        </dd>
        <dt>Status</dt>
        <dd>
          <span className={`selo ${st.classe}`}>{st.nome}</span>
        </dd>
        <dt>Relatado</dt>
        <dd>
          {haQuantoTempo(bug.criadoEm, new Date())} · {dataHora.format(new Date(bug.criadoEm))}
        </dd>
      </dl>
      <div className="secao">
        <span className="secao-t">Relato original</span>
        <Texto valor={bug.relato} vazio="Ninguém escreveu um relato." />
      </div>
      <div className="secao">
        <span className="secao-t">Passos pra reproduzir</span>
        <Texto valor={bug.passos} vazio="Sem passos anotados." />
      </div>
      <div className="duas-colunas">
        <div className="secao">
          <span className="secao-t">Esperado</span>
          <Texto valor={bug.esperado} vazio="Não informado." />
        </div>
        <div className="secao">
          <span className="secao-t">Obtido</span>
          <Texto valor={bug.obtido} vazio="Não informado." />
        </div>
      </div>
    </Painel>
  )
}
