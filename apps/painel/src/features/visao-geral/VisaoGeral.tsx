import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatarNumero } from '../../formatar.ts'
import { Carregando, EstadoErro, EstadoVazio } from '../../ui/Estados.tsx'
import { IconeCheck, IconeLua, IconePausa, IconePost } from '../../ui/icones.tsx'
import BotaoComando from './BotaoComando.tsx'
import { buscarVisaoGeral, type DadosVisaoGeral, type TarefaDaNoite } from './dados.ts'

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'erro' }
  | { situacao: 'vazio'; dados: DadosVisaoGeral }
  | { situacao: 'pronto'; dados: DadosVisaoGeral }

const FUSO = 'America/Sao_Paulo'
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO })
const diaHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: FUSO,
})
const diaMes = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: FUSO })
const soDia = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', timeZone: FUSO })

const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const SELO: Record<TarefaDaNoite['estado'], { rotulo: string; classe: string }> = {
  merge: { rotulo: 'Merge feito', classe: 'selo selo-ok' },
  pr_aberta: { rotulo: 'PR aberta', classe: 'selo selo-andamento' },
  reprovada: { rotulo: 'Reprovada', classe: 'selo selo-erro' },
  fila_dificeis: { rotulo: 'Fila de difíceis', classe: 'selo selo-aviso' },
}

function formatarHora(iso: string): string {
  return hora.format(new Date(iso)).replace(':', 'h')
}

function haQuanto(iso: string, agora = Date.now()): string {
  const min = Math.max(0, Math.floor((agora - Date.parse(iso)) / 60_000))
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`
  return `há ${Math.floor(min / (24 * 60))} d`
}

// "Noite de 18 para 19 de novembro": a noite termina no dia do resumo.
function tituloDaNoite(fimIso: string): string {
  const fim = new Date(fimIso)
  const inicio = new Date(fim.getTime() - 24 * 60 * 60 * 1000)
  const mesmoMes = diaMes.format(fim).split(' de ')[1] === diaMes.format(inicio).split(' de ')[1]
  return mesmoMes
    ? `Noite de ${soDia.format(inicio)} para ${diaMes.format(fim)}`
    : `Noite de ${diaMes.format(inicio)} para ${diaMes.format(fim)}`
}

export default function VisaoGeral({ cliente }: { cliente: SupabaseClient }) {
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' })
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let ativo = true
    buscarVisaoGeral(cliente)
      .then((dados) => {
        if (ativo) setEstado(dados.noiteTs === null ? { situacao: 'vazio', dados } : { situacao: 'pronto', dados })
      })
      .catch(() => {
        if (ativo) setEstado({ situacao: 'erro' })
      })
    return () => {
      ativo = false
    }
  }, [cliente, tentativa])

  function tentarDeNovo() {
    setEstado({ situacao: 'carregando' })
    setTentativa((n) => n + 1)
  }

  const cabecalho = (titulo: string, subtitulo: ReactNode) => (
    <div className="cabecalho">
      <div className="titulo">
        <h1>{titulo}</h1>
        {subtitulo}
      </div>
      <BotaoComando
        cliente={cliente}
        comando="pausar"
        rotulo="Pausar agente"
        icone={<IconePausa />}
        variante="botao-perigo"
        confirmacao={{
          titulo: 'Pausar o agente?',
          texto: 'O pedido vai para a fila de comandos e o agente pausa assim que ler.',
          acao: 'Sim, pausar',
        }}
        ok="Comando de pausa enviado."
        okTexto="O agente pausa assim que ler o pedido."
        falha="Não foi possível enviar o comando de pausa."
      />
    </div>
  )

  if (estado.situacao === 'carregando') {
    return (
      <div className="tela">
        {cabecalho('Visão geral', <p>Buscando como foi a noite…</p>)}
        <Carregando className="tela">
          <span className="osso osso-noite" />
          <div className="grade grade-4">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className="osso osso-numero" />
            ))}
          </div>
          <span className="osso osso-bloco" />
        </Carregando>
      </div>
    )
  }
  if (estado.situacao === 'erro') {
    return (
      <div className="tela">
        {cabecalho('Visão geral', <p>Resumo da última noite do agente.</p>)}
        <div className="painel">
          <EstadoErro
            titulo="Não foi possível carregar a visão geral."
            texto="Seus dados estão seguros. Pode ser a conexão; tenta de novo?"
            aoTentar={tentarDeNovo}
          />
        </div>
      </div>
    )
  }
  if (estado.situacao === 'vazio') {
    return (
      <div className="tela">
        {cabecalho('Visão geral', <Sincronizacao em={estado.dados.sincronizadoEm} />)}
        <div className="grade grade-2">
          <section className="painel" aria-label="Última noite">
            <header>
              <h2>Última noite</h2>
            </header>
            <EstadoVazio
              icone={<IconeLua />}
              titulo="Nenhuma atividade do agente na última noite."
              texto="Quando ele rodar, a linha da noite e os números aparecem aqui."
            />
          </section>
          <ProximoPost cliente={cliente} post={estado.dados.proximoPost} />
        </div>
      </div>
    )
  }

  const d = estado.dados
  const portoesDePrimeira = d.tarefas.filter((t) => t.resultado === 'pr_aberta' && t.tentativas === 1).length
  const pendencias = [
    d.filaDificeis > 0 && `${d.filaDificeis} ${d.filaDificeis === 1 ? 'item' : 'itens'} na fila de difíceis`,
    d.reprovadas > 0 && `${d.reprovadas} ${d.reprovadas === 1 ? 'tarefa reprovada' : 'tarefas reprovadas'} nos portões`,
  ].filter((p): p is string => p !== false)

  return (
    <div className="tela">
      {cabecalho(
        tituloDaNoite(d.noiteTs ?? ''),
        <>
          <p>
            Resultado: {d.prsComMerge} {d.prsComMerge === 1 ? 'PR com merge' : 'PRs com merge'}.
            {d.minutosFora > 0 && ` A internet caiu por ${d.minutosFora} min.`}
          </p>
          <Sincronizacao em={d.sincronizadoEm} />
        </>,
      )}

      {d.tarefas.length > 0 && <LinhaDaNoite tarefas={d.tarefas} minutosFora={d.minutosFora} />}

      <div className="grade grade-4">
        <Numero rotulo="PRs com merge" valor={String(d.prsComMerge)} />
        <Numero rotulo="Portões de primeira" valor={`${portoesDePrimeira} de ${d.tarefas.length}`} />
        <Numero rotulo="Tokens na noite" valor={formatarNumero(d.tokensDaNoite)} />
        <Numero rotulo="Gasto no mês" valor={reais.format(d.gastoNoMes)} />
      </div>

      <section className="painel" aria-label="Tarefas da noite">
        <header>
          <h2>Tarefas da noite</h2>
        </header>
        {d.itensDaNoite.length === 0 ? (
          <EstadoVazio icone={<IconeLua />} titulo="Nenhuma tarefa registrada nesta noite." texto="O resumo chegou, mas sem tarefas." />
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th scope="col">Tarefa</th>
                <th scope="col" className="col-resultado">
                  Resultado
                </th>
                <th scope="col" className="num col-tokens">
                  Tokens
                </th>
              </tr>
            </thead>
            <tbody>
              {d.itensDaNoite.map((t) => (
                <tr key={t.id}>
                  <td title={t.titulo ? `${t.item} ${t.titulo}` : t.item}>
                    <b>{t.item}</b>
                    {t.titulo && <> {t.titulo}</>}
                  </td>
                  <td>
                    <span className={SELO[t.estado].classe}>{SELO[t.estado].rotulo}</span>
                  </td>
                  <td className="num">{formatarNumero(t.tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grade grade-2">
        <ProximoPost cliente={cliente} post={d.proximoPost} />

        <section className="painel" aria-label="Precisa de você">
          <header>
            <h2>Precisa de você</h2>
          </header>
          {pendencias.length === 0 ? (
            <EstadoVazio icone={<IconeCheck />} titulo="Nada precisa de você agora." texto="Pode ir tomar um café." />
          ) : (
            <ul className="lista">
              {pendencias.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="painel numero">
      <b>{valor}</b>
      <span>{rotulo}</span>
    </div>
  )
}

function LinhaDaNoite({ tarefas, minutosFora }: { tarefas: TarefaDaNoite[]; minutosFora: number }) {
  return (
    <section className="painel noite" aria-label="Linha da noite">
      <div className="noite-barra">
        {tarefas.map((t) => (
          <span
            key={t.id}
            className={t.resultado === 'pr_aberta' ? 't-codigo' : 't-checagem'}
            style={{ '--min': Math.max(Math.round(t.segundos / 60), 1) } as CSSProperties}
            title={`${t.item} · ${formatarHora(t.ts)}`}
          />
        ))}
        {minutosFora > 0 && (
          <span className="t-queda" style={{ '--min': minutosFora } as CSSProperties} title="Internet fora" />
        )}
      </div>
      <div className="noite-pe">
        <div className="legenda">
          <span>
            <i className="t-codigo" />
            PR aberta
          </span>
          <span>
            <i className="t-checagem" />
            Reprovada
          </span>
          <span>
            <i className="t-queda" />
            Internet fora
          </span>
        </div>
        <span>
          {formatarHora(tarefas[0].ts)} a {formatarHora(tarefas[tarefas.length - 1].ts)}
        </span>
      </div>
    </section>
  )
}

function Sincronizacao({ em }: { em: string | null }) {
  return (
    <p className="pequeno">
      <span>Última sincronização:</span> {em ? <time dateTime={em}>{haQuanto(em)}</time> : 'nunca'}
    </p>
  )
}

const LIMITE_TEXTO_CURTO = 300

function ProximoPost({ cliente, post }: { cliente: SupabaseClient; post: DadosVisaoGeral['proximoPost'] }) {
  const [aberto, setAberto] = useState(false)
  const longo = (post?.texto.length ?? 0) > LIMITE_TEXTO_CURTO
  return (
    <section className="painel" aria-label="Próximo post">
      <header>
        <h2>Próximo post</h2>
        {post?.publicaEm && (
          <span className="post-quando">Publica em {diaHora.format(new Date(post.publicaEm)).replace(':', 'h')}</span>
        )}
      </header>
      {post ? (
        <>
          <p className={longo && !aberto ? 'post-texto texto-limitado' : 'post-texto'}>{post.texto}</p>
          <div className="post-acoes">
            {longo && !aberto ? (
              <button type="button" className="botao botao-fantasma botao-p" onClick={() => setAberto(true)}>
                Ler inteiro
              </button>
            ) : (
              <span />
            )}
            <BotaoComando
              cliente={cliente}
              comando="cancelar_post"
              rotulo="Cancelar post"
              variante="botao-perigo"
              confirmacao={{
                titulo: 'Cancelar este post?',
                texto: 'O agente recebe o pedido e o post não sai no horário marcado.',
                acao: 'Sim, cancelar post',
                voltar: 'Manter post',
              }}
              ok="Pedido de cancelamento enviado."
              okTexto="O agente cancela o post assim que ler o pedido."
              falha="Não foi possível cancelar o post."
            />
          </div>
        </>
      ) : (
        <EstadoVazio icone={<IconePost />} titulo="Nenhum post agendado." texto="Quando o agente agendar um post, ele aparece aqui." />
      )}
    </section>
  )
}
