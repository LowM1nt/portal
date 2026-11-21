import { useMemo, useState } from 'react'
import { chaveDia, chaveDiaUtc, diasDaSemana, periodo, proximaSemana, rotuloSemana, semanaAnterior } from './semana.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useDeploysDaSemana, type Deploy, type Fonte } from './useDeploysDaSemana.ts'
import { useAvisoDeErro } from '../../ui/avisos.ts'
import { Carregando, EstadoErro, EstadoVazio } from '../../ui/Estados.tsx'
import { IconeAvancar, IconeDeploys, IconeVoltar } from '../../ui/icones.tsx'
import './calendario.css'

const diaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const diaNumero = new Intl.DateTimeFormat('pt-BR', { day: 'numeric' })
const diaLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })

const AMBIENTES: Record<string, string> = { producao: 'produção', homologacao: 'homologação' }

const semPonto = (texto: string) => texto.replace('.', '')

export function Calendario() {
  const { api, workspaceAtivo } = useAuth()
  const fonte = useMemo<Fonte>(
    () => ({ buscar: api, caminho: '/api/deploys', escopo: workspaceAtivo?.id ?? '' }),
    [api, workspaceAtivo?.id],
  )
  return <CalendarioDaFonte fonte={fonte} />
}

/** Calendário somente leitura de uma fonte de dados (usado também pela demo, sem sessão). */
export function CalendarioDaFonte({ fonte }: { fonte: Fonte }) {
  const [semana, setSemana] = useState(() => rotuloSemana(new Date()))
  const { carregando, erro, vazio, dados, recarregar } = useDeploysDaSemana(semana, fonte)
  const dias = diasDaSemana(semana)
  const hoje = chaveDia(new Date())
  useAvisoDeErro(erro, 'Os deploys não vieram', 'Pode ser a conexão. O botão "Tentar de novo" está logo ali.')

  const porDia = new Map<string, Deploy[]>()
  for (const d of dados) {
    const chave = chaveDiaUtc(new Date(d.agendadoPara))
    porDia.set(chave, [...(porDia.get(chave) ?? []), d])
  }

  let corpo
  if (carregando) {
    corpo = (
      <Carregando className="semana-carregando">
        <div className="semana">
          {dias.map((dia) => (
            <div key={chaveDia(dia)} className="cartao dia">
              <span className="osso osso-linha" />
              <span className="osso osso-cartao" />
            </div>
          ))}
        </div>
      </Carregando>
    )
  } else if (erro) {
    corpo = (
      <div className="cartao">
        <EstadoErro
          titulo="Ops, não deu pra carregar os deploys."
          texto="Seus dados estão seguros. Tenta de novo?"
          aoTentar={recarregar}
        />
      </div>
    )
  } else if (vazio) {
    corpo = (
      <div className="cartao">
        <EstadoVazio
          icone={<IconeDeploys />}
          titulo="Nenhum deploy nesta semana"
          texto="Semana tranquila por aqui. Quando o time agendar um deploy, ele aparece neste calendário."
        />
      </div>
    )
  } else {
    corpo = (
      <ul className="semana" aria-label="Deploys da semana">
        {dias.map((dia) => {
          const chave = chaveDia(dia)
          const doDia = porDia.get(chave) ?? []
          const eHoje = chave === hoje
          return (
            <li
              key={chave}
              className={`cartao dia${eHoje ? ' dia-hoje' : ''}${doDia.length ? '' : ' dia-livre'}`}
              data-dia={chave}
              aria-label={`${diaLongo.format(dia)}${eHoje ? ', hoje' : ''}`}
            >
              <div className="dia-cab" aria-hidden="true">
                <b>
                  {semPonto(diaSemana.format(dia))}
                  {eHoje && ' · hoje'}
                </b>
                <strong>{diaNumero.format(dia)}</strong>
              </div>
              {doDia.map((d) => (
                <article
                  key={d.id}
                  className={`dep${d.status === 'cancelado' ? ' dep-cancelado' : ''}`}
                  data-testid="cartao-deploy"
                >
                  <b className="dep-titulo" title={d.titulo}>
                    {d.titulo}
                  </b>
                  <span className="dep-linha">
                    <span className="dep-hora">{hora.format(new Date(d.agendadoPara))}</span>
                    <span className="dep-ambiente">{AMBIENTES[d.ambiente] ?? d.ambiente}</span>
                  </span>
                  {d.status === 'cancelado' && <span className="selo selo-neutro">Cancelado</span>}
                </article>
              ))}
              {doDia.length === 0 && <span className="dia-vazio">Livre</span>}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <section className="calendario" aria-label="Calendário de deploys">
      <div className="calendario-barra">
        <button
          type="button"
          className="botao botao-secundario botao-icone"
          aria-label="Semana anterior"
          onClick={() => setSemana(semanaAnterior(semana))}
        >
          <IconeVoltar />
        </button>
        <h2 className="calendario-semana">{periodo(dias)}</h2>
        <button
          type="button"
          className="botao botao-secundario botao-icone"
          aria-label="Próxima semana"
          onClick={() => setSemana(proximaSemana(semana))}
        >
          <IconeAvancar />
        </button>
      </div>
      {corpo}
    </section>
  )
}
