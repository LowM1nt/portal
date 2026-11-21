import { useCallback } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useAvisoDeErro, useAvisos } from '../../ui/avisos.ts'
import { Carregando, EstadoErro, EstadoVazio } from '../../ui/Estados.tsx'
import { IconeRoadmap } from '../../ui/icones.tsx'
import type { Rota } from '../../ui/rota.ts'
import { lerLista, useCarregar } from '../../ui/useCarregar.ts'
import { COLUNAS, NOME_STATUS, atrasado, formatarPrazo, type ItemRoadmap } from './api.ts'
import { montarLinhaDoTempo } from './linhaDoTempo.ts'
import { PainelItem } from './PainelItem.tsx'
import { hrefRoadmap, visaoDaRota } from './visao.ts'
import './roadmap.css'

type Props = { rota: Rota; ir: (href: string) => void }

const COM_PROGRESSO = new Set(['planejado', 'em_andamento'])

export function Roadmap({ rota, ir }: Props) {
  const { api, workspaceAtivo } = useAuth()
  const { avisar } = useAvisos()
  const carregar = useCallback(() => lerLista<ItemRoadmap>(api('/api/roadmap')), [api])
  const itens = useCarregar(carregar, workspaceAtivo?.id ?? null)
  const visao = visaoDaRota(rota)
  const alvo = rota.partes[1] ?? null
  useAvisoDeErro(itens.estado === 'erro', 'O roadmap não veio', 'Pode ser a conexão. O botão "Tentar de novo" está logo ali.')

  const lista = itens.dados ?? []
  const hoje = new Date()
  const fechar = () => ir(hrefRoadmap(visao))
  const novo = () => ir(hrefRoadmap(visao, 'novo'))

  function salvo(item: ItemRoadmap, criado: boolean) {
    itens.definir((atual) => (criado ? [...atual, item] : atual.map((i) => (i.id === item.id ? item : i))))
  }

  function concluido(item: ItemRoadmap, criado: boolean) {
    salvo(item, criado)
    avisar({ tipo: 'ok', titulo: criado ? 'Item criado!' : 'Item salvo', texto: `“${item.titulo}” está em ${NOME_STATUS[item.status]}.` })
    fechar()
  }

  let corpo
  if (itens.estado === 'carregando') {
    corpo = (
      <Carregando className="quadro quadro-carregando">
        {COLUNAS.map((c) => (
          <div key={c.status} className="cartao rm-coluna">
            <span className="osso osso-rm-cab" />
            <span className="osso osso-rm" />
            <span className="osso osso-rm" />
          </div>
        ))}
      </Carregando>
    )
  } else if (itens.estado === 'erro') {
    corpo = (
      <div className="cartao">
        <EstadoErro titulo="Ops, não deu pra carregar o roadmap." texto="Seus dados estão seguros. Tenta de novo?" aoTentar={itens.recarregar} />
      </div>
    )
  } else if (lista.length === 0) {
    corpo = (
      <div className="cartao">
        <EstadoVazio
          icone={<IconeRoadmap />}
          titulo="Roadmap em branco"
          texto="Anota a primeira ideia e acompanha até a entrega."
          acao={
            <button type="button" className="botao botao-primario" onClick={novo}>
              Novo item
            </button>
          }
        />
      </div>
    )
  } else if (visao === 'quadro') {
    corpo = (
      <div className="quadro" data-sem-arrasto="">
        {COLUNAS.map((c) => {
          const daColuna = lista.filter((i) => i.status === c.status)
          return (
            <section key={c.status} className="cartao rm-coluna" aria-label={`${c.nome}: ${daColuna.length}`} data-testid={`coluna-${c.status}`}>
              <div className="rm-cab" aria-hidden="true">
                <h2>{c.nome}</h2>
                <span className="rm-conta">{daColuna.length}</span>
              </div>
              {daColuna.length === 0 ? (
                <span className="rm-vazio">Nada por aqui</span>
              ) : (
                <ul className="rm-itens">
                  {daColuna.map((i) => {
                    const tarde = atrasado(i, hoje)
                    return (
                      <li key={i.id} className="rm-item" data-testid="item-roadmap">
                        <a className="rm-titulo link-esticado" href={hrefRoadmap(visao, i.id)}>
                          {i.titulo}
                        </a>
                        {COM_PROGRESSO.has(i.status) && (
                          <div
                            className="progresso"
                            role="progressbar"
                            aria-label={`Progresso de ${i.titulo}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={i.progresso}
                          >
                            <i style={{ width: `${Math.min(Math.max(i.progresso, 0), 100)}%` }} />
                          </div>
                        )}
                        <div className="rm-l">
                          <span className={tarde ? 'rm-atrasado' : undefined}>
                            {!i.prazo ? 'Sem prazo' : `${tarde ? 'Venceu' : 'Prazo:'} ${formatarPrazo(i.prazo)}`}
                          </span>
                          {i.status === 'entregue' ? (
                            <span className="selo selo-ok">Entregue</span>
                          ) : (
                            COM_PROGRESSO.has(i.status) && <span className="rm-pct">{i.progresso}%</span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    )
  } else {
    const lt = montarLinhaDoTempo(lista, hoje)
    corpo =
      lt.barras.length === 0 ? (
        <div className="cartao">
          <EstadoVazio
            icone={<IconeRoadmap />}
            titulo="Nenhum item com prazo"
            texto="Dá um prazo aos itens pra eles aparecerem na linha do tempo."
            acao={
              <a className="botao botao-secundario" href={hrefRoadmap('quadro')}>
                Ver o quadro
              </a>
            }
          />
        </div>
      ) : (
        <section className="cartao lt" aria-label="Linha do tempo">
          <div className="lt-rolagem" data-sem-arrasto="">
            <div className="lt-grade">
              <div className="lt-linha lt-meses" aria-hidden="true">
                <span />
                <div className="lt-trilho">
                  {lt.meses.map((m) => (
                    <span key={m.chave} className="lt-mes" style={{ left: `${m.esquerda}%`, width: `${m.largura}%` }}>
                      {m.rotulo}
                    </span>
                  ))}
                </div>
              </div>
              <ul className="lt-lista">
                {lt.barras.map(({ item, esquerda, largura }) => (
                  <li key={item.id} className="lt-linha" data-testid="barra-roadmap">
                    <a className="lt-nome" href={hrefRoadmap(visao, item.id)}>
                      {item.titulo}
                    </a>
                    <div className="lt-trilho">
                      {lt.meses.slice(1).map((m) => (
                        <i key={m.chave} className="lt-divisa" style={{ left: `${m.esquerda}%` }} aria-hidden="true" />
                      ))}
                      {lt.hoje !== null && <i className="lt-hoje" style={{ left: `${lt.hoje}%` }} aria-hidden="true" />}
                      <span className={`lt-barra lt-${item.status}`} style={{ left: `${esquerda}%`, width: `${largura}%` }}>
                        {NOME_STATUS[item.status]} · {formatarPrazo(item.prazo!)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {lt.semPrazo.length > 0 && (
            <p className="lt-nota">
              {lt.semPrazo.length === 1 ? '1 item sem prazo fica só no quadro.' : `${lt.semPrazo.length} itens sem prazo ficam só no quadro.`}
            </p>
          )}
        </section>
      )
  }

  const editando = alvo && alvo !== 'novo' && itens.estado === 'pronto' ? (lista.find((i) => i.id === alvo) ?? null) : undefined

  return (
    <section className="tela-roadmap" aria-label="Roadmap">
      <div className="barra">
        <nav className="segmento" aria-label="Visão do roadmap">
          <a className="segmento-op" href={hrefRoadmap('quadro')} aria-current={visao === 'quadro' ? 'true' : undefined}>
            Quadro
          </a>
          <a className="segmento-op" href={hrefRoadmap('tempo')} aria-current={visao === 'tempo' ? 'true' : undefined}>
            Linha do tempo
          </a>
        </nav>
      </div>
      {corpo}
      {alvo === 'novo' && itens.estado !== 'carregando' && <PainelItem novo item={null} aoFechar={fechar} aoConcluir={concluido} aoSalvarParcial={salvo} />}
      {editando !== undefined && (
        <PainelItem key={editando?.id ?? 'sumiu'} item={editando} aoFechar={fechar} aoConcluir={concluido} aoSalvarParcial={salvo} />
      )}
    </section>
  )
}
