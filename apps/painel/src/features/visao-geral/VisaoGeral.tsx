import type { CSSProperties, ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import PausarAgente from './PausarAgente.tsx'
import { useVisaoGeral, type Tarefa } from './useVisaoGeral.ts'

const ROTULO_ESTADO: Record<string, string> = {
  merge_feito: 'Merge feito',
  fila_de_dificeis: 'Fila de difíceis',
}

const numero = new Intl.NumberFormat('pt-BR')
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const diaHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function formatarTokens(n: number): string {
  return n >= 1000 ? `${numero.format(Math.round(n / 1000))} mil` : numero.format(n)
}

function formatarHora(iso: string, formato = hora): string {
  return formato.format(new Date(iso)).replace(':', 'h')
}

export default function VisaoGeral({ cliente }: { cliente: SupabaseClient }) {
  const estado = useVisaoGeral(cliente)

  const cabecalho = (conteudo: ReactNode) => (
    <div className="cabecalho">
      {conteudo}
      <PausarAgente cliente={cliente} />
    </div>
  )

  if (estado.situacao === 'carregando') {
    return (
      <div className="grade">
        {cabecalho(
          <p className="suave" aria-busy="true">
            Carregando…
          </p>,
        )}
      </div>
    )
  }
  if (estado.situacao === 'erro') {
    return (
      <div className="grade">
        {cabecalho(
          <p role="alert" className="selo selo-erro">
            Não foi possível carregar a visão geral. Tente novamente em instantes.
          </p>,
        )}
      </div>
    )
  }

  const { tarefas, proximoPost, precisaDeVoce, dataDaNoite, gastoNoMes, sincronizadoEm } = estado.dados

  return (
    <div className="grade">
      {cabecalho(
        sincronizadoEm ? (
          <p className="suave pequeno">
            <span>Última sincronização</span> <time dateTime={sincronizadoEm}>{formatarHora(sincronizadoEm, diaHora)}</time>
          </p>
        ) : (
          <p className="suave pequeno">Ainda não houve sincronização.</p>
        ),
      )}
      {dataDaNoite && tarefas.length > 0 && (
        <p className="suave pequeno">Noite de {dia.format(new Date(dataDaNoite))}</p>
      )}

      {tarefas.length === 0 ? (
        <p className="vazio">Nenhuma atividade do agente na última noite.</p>
      ) : (
        <>
          <LinhaDaNoite tarefas={tarefas} />
          <div className="grade grade-4">
            <Numero rotulo="PRs com merge" valor={String(tarefas.filter((t) => t.estado === 'merge_feito').length)} />
            <Numero
              rotulo="Portões de primeira"
              valor={`${tarefas.filter((t) => t.portao_primeira === true).length} de ${tarefas.length}`}
            />
            <Numero rotulo="Tokens na noite" valor={formatarTokens(tarefas.reduce((s, t) => s + t.tokens, 0))} />
            <Numero rotulo="Gasto no mês" valor={`${formatarTokens(gastoNoMes)} tokens`} />
          </div>
          <section className="painel" aria-label="Tarefas da noite">
            <ul className="lista">
              {tarefas.map((t) => (
                <li key={t.id}>
                  <span>
                    {t.item_id} · {t.titulo}
                  </span>
                  <span className={t.estado === 'merge_feito' ? 'selo selo-ok' : 'selo selo-atencao'}>
                    {ROTULO_ESTADO[t.estado] ?? t.estado}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="painel" aria-label="Próximo post">
        {proximoPost ? (
          <>
            <p>{proximoPost.texto}</p>
            {proximoPost.publicaEm && (
              <p className="suave pequeno">Publica em {formatarHora(proximoPost.publicaEm, diaHora)}</p>
            )}
          </>
        ) : (
          <p className="vazio">Nenhum post agendado.</p>
        )}
      </section>

      <section className="painel" aria-label="Precisa de você">
        {precisaDeVoce.length === 0 ? (
          <p className="vazio">Nada precisa de você agora.</p>
        ) : (
          <ul className="lista">
            {precisaDeVoce.map((p) => (
              <li key={p.id}>{p.texto}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="numero">
      <b>{valor}</b>
      <span>{rotulo}</span>
    </div>
  )
}

function LinhaDaNoite({ tarefas }: { tarefas: Tarefa[] }) {
  return (
    <section className="painel noite" aria-label="Linha da noite">
      <div className="noite-barra">
        {tarefas.map((t) => (
          <span
            key={t.id}
            className={t.estado === 'merge_feito' ? 't-codigo' : 't-queda'}
            style={{ '--min': Math.max(t.tokens, 1) } as CSSProperties}
            title={`${t.item_id} · ${formatarHora(t.criado_em)}`}
          />
        ))}
      </div>
      <div className="noite-horas">
        <span>{formatarHora(tarefas[0].criado_em)}</span>
        <span>{formatarHora(tarefas[tarefas.length - 1].criado_em)}</span>
      </div>
    </section>
  )
}
