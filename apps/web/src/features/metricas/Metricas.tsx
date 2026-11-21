import { useCallback } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useAvisoDeErro } from '../../ui/avisos.ts'
import { Carregando, EstadoErro, EstadoVazio } from '../../ui/Estados.tsx'
import { IconeMetricas } from '../../ui/icones.tsx'
import { useCarregar } from '../../ui/useCarregar.ts'
import { Grafico } from './Grafico.tsx'
import {
  descreverVariacao,
  formatarDuracao,
  formatarFrequencia,
  formatarTaxa,
  rotuloSemana,
  temDados,
  type Metrica,
  type Metricas as DadosMetricas,
  type Periodo,
} from './formato.ts'
import './metricas.css'

type Cartao = {
  nome: string
  metrica: Metrica
  formatar: (v: number) => string
  subirEBom: boolean
  semDados: string
}

function Numero({ nome, metrica, formatar, subirEBom, semDados }: Cartao) {
  const variacao = descreverVariacao(metrica.variacao, subirEBom)
  return (
    <div className="cartao numero" role="listitem">
      <small>{nome}</small>
      <strong>{metrica.valor === null ? '—' : formatar(metrica.valor)}</strong>
      {metrica.valor === null ? (
        <em title={semDados}>Ainda sem dados suficientes</em>
      ) : variacao ? (
        <em className={`variacao-${variacao.tendencia}`}>{variacao.texto}</em>
      ) : (
        <em>Sem período anterior pra comparar</em>
      )}
    </div>
  )
}

/** Métricas de entrega (D-010): os quatro números com variação e as séries por semana. */
export function Metricas({ semanas }: { semanas: Periodo }) {
  const { api, workspaceAtivo } = useAuth()
  const carregar = useCallback(async () => {
    const r = await api(`/api/metricas?semanas=${semanas}`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const corpo = (await r.json()) as DadosMetricas
    if (!corpo || !Array.isArray(corpo.series) || !corpo.deploysPorDia) throw new Error('Resposta inválida')
    return corpo
  }, [api, semanas])
  const recurso = useCarregar(carregar, workspaceAtivo ? `${workspaceAtivo.id}#${semanas}` : null)
  useAvisoDeErro(recurso.estado === 'erro', 'As métricas não vieram', 'Pode ser a conexão. O botão "Tentar de novo" está logo ali.')

  if (recurso.estado === 'carregando') {
    return (
      <Carregando className="tela-metricas">
        <div className="numeros">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className="osso osso-numero" />
          ))}
        </div>
        <div className="graficos">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className="osso osso-grafico" />
          ))}
        </div>
      </Carregando>
    )
  }

  if (recurso.estado === 'erro' || !recurso.dados) {
    return (
      <div className="cartao">
        <EstadoErro titulo="Ops, não deu pra calcular as métricas." texto="Seus dados estão seguros. Tenta de novo?" aoTentar={recurso.recarregar} />
      </div>
    )
  }

  const m = recurso.dados
  if (!temDados(m)) {
    return (
      <div className="cartao">
        <EstadoVazio
          icone={<IconeMetricas />}
          titulo="Ainda sem dados suficientes"
          texto={`Nenhum deploy marcado como concluído ou com falha nas últimas ${semanas} semanas. Abra um deploy no calendário e marque como foi: as métricas começam a aparecer na hora.`}
          acao={
            <a className="botao botao-secundario" href="#/deploys">
              Ir para Deploys
            </a>
          }
        />
      </div>
    )
  }

  const rotulos = m.series.map(rotuloSemana)
  const cartoes: Cartao[] = [
    {
      nome: 'Frequência de deploy',
      metrica: m.deploysPorDia,
      formatar: formatarFrequencia,
      subirEBom: true,
      semDados: 'Conta os deploys marcados como concluídos.',
    },
    {
      nome: 'Tempo até o deploy',
      metrica: m.tempoAteDeployHoras,
      formatar: formatarDuracao,
      subirEBom: false,
      semDados: 'Aparece quando há deploys concluídos no período.',
    },
    {
      nome: 'Taxa de falha',
      metrica: m.taxaDeFalha,
      formatar: formatarTaxa,
      subirEBom: false,
      semDados: 'Aparece quando há deploys concluídos ou com falha no período.',
    },
    {
      nome: 'Tempo para recuperar',
      metrica: m.tempoParaRecuperarHoras,
      formatar: formatarDuracao,
      subirEBom: false,
      semDados: 'Aparece quando um deploy que falhou é seguido por um concluído no mesmo repositório.',
    },
  ]
  const nulos = cartoes.filter((c) => c.metrica.valor === null)

  return (
    <div className="tela-metricas">
      <div className="numeros" role="list" aria-label={`Métricas das últimas ${semanas} semanas`}>
        {cartoes.map((c) => (
          <Numero key={c.nome} {...c} />
        ))}
      </div>
      {nulos.length > 0 && (
        <ul className="nota nota-lista" aria-label="Como passar a ter dados">
          {nulos.map((c) => (
            <li key={c.nome}>
              <b>{c.nome}:</b> {c.semDados}
            </li>
          ))}
        </ul>
      )}
      <div className="graficos">
        <section className="cartao bloco" aria-labelledby="graf-deploys">
          <div className="bloco-cab">
            <h2 id="graf-deploys">Deploys por semana</h2>
          </div>
          <div className="grafico-corpo">
            <Grafico titulo="Deploys concluídos por semana" valores={m.series.map((s) => s.deploys)} rotulos={rotulos} formatar={(v) => String(Math.round(v))} />
          </div>
        </section>
        <section className="cartao bloco" aria-labelledby="graf-lead">
          <div className="bloco-cab">
            <h2 id="graf-lead">Tempo até o deploy</h2>
          </div>
          <div className="grafico-corpo">
            <Grafico titulo="Tempo até o deploy por semana" valores={m.series.map((s) => s.tempoAteDeployHoras)} rotulos={rotulos} formatar={formatarDuracao} />
          </div>
        </section>
        <section className="cartao bloco" aria-labelledby="graf-falha">
          <div className="bloco-cab">
            <h2 id="graf-falha">Taxa de falha</h2>
          </div>
          <div className="grafico-corpo">
            <Grafico titulo="Taxa de falha por semana" valores={m.series.map((s) => s.taxaDeFalha)} rotulos={rotulos} formatar={formatarTaxa} />
          </div>
        </section>
        <section className="cartao bloco" aria-labelledby="graf-recuperar">
          <div className="bloco-cab">
            <h2 id="graf-recuperar">Tempo para recuperar</h2>
          </div>
          <div className="grafico-corpo">
            <Grafico
              titulo="Tempo para recuperar por semana"
              valores={m.series.map((s) => s.tempoParaRecuperarHoras)}
              rotulos={rotulos}
              formatar={formatarDuracao}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
