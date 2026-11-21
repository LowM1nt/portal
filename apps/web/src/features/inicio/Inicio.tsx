import { useCallback, useState } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { SEVERIDADES } from '../bugs/api.ts'
import { chaveDia, chaveDiaUtc, diasDaSemana, proximaSemana, rotuloSemana } from '../calendario/semana.ts'
import type { Deploy } from '../calendario/useDeploysDaSemana.ts'
import { usePendencias } from '../pendencias/pendencias.ts'
import { haQuantoTempo } from '../revisoes/tempo.ts'
import { useAvisoDeErro } from '../../ui/avisos.ts'
import { Carregando, EstadoErro, EstadoVazio } from '../../ui/Estados.tsx'
import { IconeDiscord, IconeInicio, IconePessoa } from '../../ui/icones.tsx'
import { lerLista, useCarregar } from '../../ui/useCarregar.ts'
import './inicio.css'

const CI: Record<string, { rotulo: string; classe: string }> = {
  sucesso: { rotulo: 'Sucesso', classe: 'selo-ok' },
  falhou: { rotulo: 'Falhou', classe: 'selo-erro' },
  rodando: { rotulo: 'Rodando', classe: 'selo-andamento' },
  'sem CI': { rotulo: 'Sem CI', classe: 'selo-neutro' },
}
const AMBIENTES: Record<string, string> = { producao: 'produção', homologacao: 'homologação' }
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
const diaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
const diaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
const DIA = 86_400_000

/** "Hoje, 16:00", "Amanhã, 11:00", "Qui, 10:30" ou "02/12, 10:30" (mesmo relógio do calendário). */
function quando(iso: string, agora: Date): string {
  const d = new Date(iso)
  const chave = chaveDiaUtc(d)
  const h = hora.format(d)
  if (chave === chaveDia(agora)) return `Hoje, ${h}`
  if (chave === chaveDia(new Date(agora.getTime() + DIA))) return `Amanhã, ${h}`
  if (d.getTime() - agora.getTime() < 6 * DIA) {
    const dia = diaSemana.format(d).replace('.', '')
    return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${h}`
  }
  return `${diaMes.format(d)}, ${h}`
}

const urlSegura = (url: string) => (/^https:\/\//i.test(url) ? url : undefined)

/** Visão geral da semana: números, próximos deploys, fila de revisão e bugs a triar. */
export function Inicio() {
  const { api, workspaceAtivo } = useAuth()
  const { bugs, revisoes } = usePendencias()
  const [semana] = useState(() => rotuloSemana(new Date()))
  const carregarDeploys = useCallback(async () => {
    const [esta, proxima] = await Promise.all([
      lerLista<Deploy>(api(`/api/deploys?semana=${encodeURIComponent(semana)}`)),
      lerLista<Deploy>(api(`/api/deploys?semana=${encodeURIComponent(proximaSemana(semana))}`)),
    ])
    return { esta, proxima }
  }, [api, semana])
  const deploys = useCarregar(carregarDeploys, workspaceAtivo?.id ?? null)

  const recursos = [deploys, bugs, revisoes]
  const carregando = recursos.some((r) => r.estado === 'carregando')
  const erro = !carregando && recursos.some((r) => r.estado === 'erro')
  useAvisoDeErro(erro, 'Parte do Início não veio', 'Pode ser a conexão. O botão "Tentar de novo" está logo ali.')

  if (carregando) {
    return (
      <Carregando className="tela-inicio">
        <div className="numeros">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className="osso osso-numero" />
          ))}
        </div>
        <div className="inicio-grade">
          {[0, 1, 2].map((n) => (
            <span key={n} className="osso osso-bloco-inicio" />
          ))}
        </div>
      </Carregando>
    )
  }

  if (erro) {
    return (
      <div className="cartao">
        <EstadoErro
          titulo="Ops, não deu pra montar o Início."
          texto="Seus dados estão seguros. Tenta de novo?"
          aoTentar={() => recursos.filter((r) => r.estado === 'erro').forEach((r) => r.recarregar())}
        />
      </div>
    )
  }

  const { esta = [], proxima = [] } = deploys.dados ?? {}
  const listaBugs = bugs.dados ?? []
  const fila = revisoes.dados ?? []

  if (esta.length + proxima.length + listaBugs.length + fila.length === 0) {
    return (
      <div className="cartao">
        <EstadoVazio
          icone={<IconeInicio />}
          titulo="Tudo quietinho por aqui"
          texto="Assim que o time marcar deploys, abrir PRs ou relatar bugs, eles aparecem nesta tela."
          acao={
            <a className="botao botao-secundario" href="#/deploys">
              Ver o calendário
            </a>
          }
        />
      </div>
    )
  }

  const agora = new Date()
  const segunda = diasDaSemana(semana)[0].getTime()
  const daSemana = esta.filter((d) => d.status !== 'cancelado')
  const aindaVem = daSemana.filter((d) => new Date(d.agendadoPara).getTime() >= agora.getTime()).length
  const proximos = [...esta, ...proxima]
    .filter((d) => d.status !== 'cancelado' && new Date(d.agendadoPara).getTime() >= agora.getTime())
    .sort((a, b) => a.agendadoPara.localeCompare(b.agendadoPara))
    .slice(0, 4)
  const velhas = fila.filter((p) => agora.getTime() - new Date(p.atualizadaEm).getTime() > DIA).length
  const aTriar = listaBugs.filter((b) => b.status === 'a_triar')
  const graves = aTriar.filter((b) => b.severidade === 'critica' || b.severidade === 'alta').length
  const resolvidos = listaBugs.filter((b) => b.status === 'resolvido' && new Date(b.atualizadoEm).getTime() >= segunda).length
  const andamento = listaBugs.filter((b) => b.status === 'em_andamento' || b.status === 'aberto').length

  return (
    <div className="tela-inicio">
      <div className="numeros" role="list" aria-label="Números da semana">
        <div className="cartao numero" role="listitem">
          <small>Deploys na semana</small>
          <strong>{daSemana.length}</strong>
          <em>{aindaVem ? `${aindaVem} ainda por vir` : 'Nenhum por vir'}</em>
        </div>
        <div className="cartao numero" role="listitem">
          <small>Esperando revisão</small>
          <strong>{fila.length}</strong>
          <em className={velhas ? 'atencao' : undefined}>{velhas ? `${velhas} há mais de 24 h` : 'Tudo fresquinho'}</em>
        </div>
        <div className="cartao numero" role="listitem">
          <small>Bugs a triar</small>
          <strong>{aTriar.length}</strong>
          <em className={graves ? 'atencao' : undefined}>{graves ? `${graves} ${graves === 1 ? 'grave' : 'graves'}` : 'Nenhum grave'}</em>
        </div>
        <div className="cartao numero" role="listitem">
          <small>Resolvidos na semana</small>
          <strong>{resolvidos}</strong>
          <em>{andamento ? `${andamento} em andamento` : 'Nenhum em andamento'}</em>
        </div>
      </div>

      <div className="inicio-grade">
        <section className="cartao bloco" aria-labelledby="inicio-deploys">
          <div className="bloco-cab">
            <h2 id="inicio-deploys">Próximos deploys</h2>
            <a className="botao botao-secundario botao-p" href="#/deploys">
              Ver calendário
            </a>
          </div>
          {proximos.length === 0 ? (
            <p className="bloco-vazio">Nenhum deploy marcado pros próximos dias.</p>
          ) : (
            <ul className="lista-itens">
              {proximos.map((d) => (
                <li key={d.id} className="item-cel">
                  <div className="item-l1">
                    <span className="item-titulo">{d.titulo}</span>
                  </div>
                  <div className="item-l2">
                    <span className="mono">{AMBIENTES[d.ambiente] ?? d.ambiente}</span>
                    <span className="fim">{quando(d.agendadoPara, agora)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cartao bloco" aria-labelledby="inicio-revisoes">
          <div className="bloco-cab">
            <h2 id="inicio-revisoes">Esperando revisão</h2>
            <a className="botao botao-secundario botao-p" href="#/revisoes">
              Ver fila
            </a>
          </div>
          {fila.length === 0 ? (
            <p className="bloco-vazio">Nada pra revisar. Aproveita!</p>
          ) : (
            <ul className="lista-itens">
              {fila.slice(0, 4).map((p) => {
                const ci = CI[p.statusCi] ?? CI['sem CI']
                const velha = agora.getTime() - new Date(p.atualizadaEm).getTime() > DIA
                return (
                  <li key={`${p.repositorio}#${p.numero}`} className="item-cel">
                    <div className="item-l1">
                      <a className="item-titulo link-esticado" href={urlSegura(p.url)} target="_blank" rel="noopener noreferrer">
                        {p.titulo}
                      </a>
                      <span className={`selo ${ci.classe}`}>{ci.rotulo}</span>
                    </div>
                    <div className="item-l2">
                      <span>{p.autor}</span>
                      <span className="mono">{p.repositorio}</span>
                      <span className={`fim${velha ? ' atencao' : ''}`}>{haQuantoTempo(p.atualizadaEm, agora)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="cartao bloco bloco-bugs" aria-labelledby="inicio-bugs">
          <div className="bloco-cab">
            <h2 id="inicio-bugs">Bugs a triar</h2>
            <a className="botao botao-secundario botao-p" href="#/bugs">
              Ver bugs
            </a>
          </div>
          {aTriar.length === 0 ? (
            <p className="bloco-vazio">Nenhum bug esperando triagem.</p>
          ) : (
            <ul className="lista-itens">
              {aTriar.slice(0, 4).map((b) => {
                const sev = SEVERIDADES[b.severidade] ?? SEVERIDADES.media
                return (
                  <li key={b.id} className="item-cel">
                    <div className="item-l1">
                      <a className="item-titulo link-esticado" href={`#/bugs/${encodeURIComponent(b.id)}?f=a_triar`}>
                        {b.titulo}
                      </a>
                      <span className={`selo ${sev.classe}`}>{sev.nome}</span>
                    </div>
                    <div className="item-l2">
                      {b.origem === 'discord' ? <IconeDiscord /> : <IconePessoa />}
                      <span>{b.origem === 'discord' ? 'Discord' : 'Time'}</span>
                      <span className="fim">{haQuantoTempo(b.criadoEm, agora)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
