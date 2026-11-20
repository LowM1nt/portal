import { useState } from 'react'
import { chaveDia, diasDaSemana, proximaSemana, rotuloSemana, semanaAnterior } from './semana.ts'
import { useDeploysDaSemana, type Deploy } from './useDeploysDaSemana.ts'
import './calendario.css'

const diaMes = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })

export function Calendario() {
  const [semana, setSemana] = useState(() => rotuloSemana(new Date()))
  const { carregando, erro, vazio, dados, recarregar } = useDeploysDaSemana(semana)
  const dias = diasDaSemana(semana)

  const porDia = new Map<string, Deploy[]>()
  for (const d of dados) {
    const chave = chaveDia(new Date(d.agendadoPara))
    porDia.set(chave, [...(porDia.get(chave) ?? []), d])
  }

  return (
    <section className="painel calendario" aria-label="Calendário de deploys">
      <header className="calendario-topo">
        <button type="button" className="botao botao-quieto" onClick={() => setSemana(semanaAnterior(semana))}>
          Semana anterior
        </button>
        <h2 className="calendario-semana">Semana {semana}</h2>
        <button type="button" className="botao botao-quieto" onClick={() => setSemana(proximaSemana(semana))}>
          Próxima semana
        </button>
      </header>

      {carregando && <p className="suave">Carregando…</p>}
      {erro && (
        <div className="calendario-aviso">
          <p role="alert" className="selo selo-erro">
            Não foi possível carregar os deploys.
          </p>
          <button type="button" className="botao botao-primario" onClick={recarregar}>
            Tentar de novo
          </button>
        </div>
      )}
      {!carregando && vazio && <p className="suave">Nenhum deploy nesta semana</p>}

      {!carregando && !erro && (
        <ul className="calendario-dias" aria-label="Deploys da semana">
          {dias.map((dia) => {
            const chave = chaveDia(dia)
            return (
              <li key={chave} className="calendario-dia" data-dia={chave}>
                <h3 className="calendario-dia-titulo pequeno">{diaMes.format(dia)}</h3>
                {(porDia.get(chave) ?? []).map((d) => (
                  <article key={d.id} className="calendario-cartao" data-testid="cartao-deploy">
                    <span className="pequeno suave">{hora.format(new Date(d.agendadoPara))}</span>
                    <span>{d.titulo}</span>
                  </article>
                ))}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
