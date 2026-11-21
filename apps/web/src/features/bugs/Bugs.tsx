import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { usePendencias } from '../pendencias/pendencias.ts'
import { haQuantoTempo } from '../revisoes/tempo.ts'
import { useAvisoDeErro, useAvisos } from '../../ui/avisos.ts'
import { Carregando, EstadoErro, EstadoVazio } from '../../ui/Estados.tsx'
import { IconeBugs, IconeDiscord, IconePessoa } from '../../ui/icones.tsx'
import type { Rota } from '../../ui/rota.ts'
import { ABAS, SEVERIDADES, STATUS, abaDoStatus, moverBug, type Aba, type Bug, type Severidade, type StatusBug } from './api.ts'
import { PainelBug } from './PainelBug.tsx'
import './bugs.css'

type Props = { rota: Rota; ir: (href: string) => void; aoRelatar: () => void }

const FILTROS: { id: Severidade | 'todas'; nome: string }[] = [
  { id: 'todas', nome: 'Todas' },
  { id: 'critica', nome: 'Crítica' },
  { id: 'alta', nome: 'Alta' },
  { id: 'media', nome: 'Média' },
  { id: 'baixa', nome: 'Baixa' },
]

const VAZIO: Record<Aba, { titulo: string; texto: string }> = {
  a_triar: { titulo: 'Nenhum bug esperando triagem', texto: 'Quando alguém relatar um bug, ele aparece aqui. Bora manter assim!' },
  andamento: { titulo: 'Ninguém mexendo em bug agora', texto: 'Quando alguém começar a resolver um bug, ele aparece aqui.' },
  resolvido: { titulo: 'Nenhum bug resolvido ainda', texto: 'Os bugs resolvidos e descartados ficam guardados aqui.' },
}

const AVISO_MOVIDO: Record<StatusBug, string> = {
  a_triar: 'Voltou pra triagem',
  aberto: 'Bug aberto',
  em_andamento: 'Bora resolver!',
  resolvido: 'Bug resolvido!',
  descartado: 'Bug descartado',
}

const lerAba = (rota: Rota): Aba => ABAS.find((a) => a.id === rota.params.get('f'))?.id ?? 'a_triar'

export function Bugs({ rota, ir, aoRelatar }: Props) {
  const { api } = useAuth()
  const { bugs } = usePendencias()
  const { avisar } = useAvisos()
  const [severidade, setSeveridade] = useState<Severidade | 'todas'>('todas')
  const aba = lerAba(rota)
  const idAberto = rota.partes[1] ?? null
  useAvisoDeErro(bugs.estado === 'erro', 'Os bugs não vieram', 'Pode ser a conexão. O botão "Tentar de novo" está logo ali.')

  const lista = bugs.dados ?? []
  const daAba = (id: Aba) => lista.filter((b) => (ABAS.find((a) => a.id === id)!.status as readonly StatusBug[]).includes(b.status))
  const visiveis = daAba(aba).filter((b) => severidade === 'todas' || b.severidade === severidade)
  const fecharPainel = () => ir(`#/bugs?f=${aba}`)

  async function mover(bug: Bug, status: StatusBug): Promise<void> {
    let atualizado: Bug | null = null
    try {
      const r = await moverBug(api, bug.id, status)
      if (r.ok) atualizado = (await r.json()) as Bug
    } catch {
      atualizado = null
    }
    if (!atualizado?.id) {
      avisar({ tipo: 'erro', titulo: 'Não deu pra mover o bug', texto: 'Sem conexão? Tenta de novo em instantes.' })
      return
    }
    const novo = atualizado
    bugs.definir((atual) => atual.map((b) => (b.id === novo.id ? novo : b)))
    const destino = ABAS.find((a) => a.id === abaDoStatus(novo.status))!
    avisar({ tipo: 'ok', titulo: AVISO_MOVIDO[novo.status], texto: `“${novo.titulo}” foi pra ${destino.nome}.` })
    ir(`#/bugs?f=${destino.id}`)
  }

  let corpo
  if (bugs.estado === 'carregando') {
    corpo = (
      <Carregando className="cartao bugs-carregando">
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n} className="osso osso-bug" />
        ))}
      </Carregando>
    )
  } else if (bugs.estado === 'erro') {
    corpo = (
      <div className="cartao">
        <EstadoErro titulo="Ops, não deu pra carregar os bugs." texto="Seus dados estão seguros. Tenta de novo?" aoTentar={bugs.recarregar} />
      </div>
    )
  } else if (visiveis.length === 0) {
    const filtrando = severidade !== 'todas' && daAba(aba).length > 0
    corpo = (
      <div className="cartao">
        <EstadoVazio
          icone={<IconeBugs />}
          titulo={filtrando ? 'Nada com essa severidade' : VAZIO[aba].titulo}
          texto={filtrando ? 'Nenhum bug desta aba bate com o filtro. Que tal ver todos?' : VAZIO[aba].texto}
          acao={
            filtrando ? (
              <button type="button" className="botao botao-secundario" onClick={() => setSeveridade('todas')}>
                Ver todas as severidades
              </button>
            ) : (
              aba === 'a_triar' && (
                <button type="button" className="botao botao-primario" onClick={aoRelatar}>
                  Relatar bug
                </button>
              )
            )
          }
        />
      </div>
    )
  } else {
    const agora = new Date()
    corpo = (
      <div className="cartao bugs">
        <div className="bugs-cab" aria-hidden="true">
          <span>Bug</span>
          <span>Severidade</span>
          <span>Status</span>
          <span className="bugs-col-origem">Origem</span>
          <span className="bugs-dir">Relatado</span>
        </div>
        <ul className="bugs-lista" aria-label={`Bugs: ${ABAS.find((a) => a.id === aba)!.nome}`}>
          {visiveis.map((b) => {
            const sev = SEVERIDADES[b.severidade] ?? SEVERIDADES.media
            const st = STATUS[b.status] ?? STATUS.a_triar
            return (
              <li key={b.id} className="bugs-linha" data-testid="linha-bug">
                <span className="bugs-bug">
                  <a className="bugs-titulo link-esticado" href={`#/bugs/${encodeURIComponent(b.id)}?f=${aba}`}>
                    {b.titulo}
                  </a>
                  {b.relato && <span className="bugs-relato">{b.relato}</span>}
                </span>
                <span className="bugs-sev">
                  <span className={`selo ${sev.classe}`}>{sev.nome}</span>
                </span>
                <span className="bugs-status">
                  <span className={`selo ${st.classe}`}>{st.nome}</span>
                </span>
                <span className="bugs-origem bugs-col-origem">
                  {b.origem === 'discord' ? <IconeDiscord /> : <IconePessoa />}
                  {b.origem === 'discord' ? 'Discord' : 'Time'}
                </span>
                <span className="bugs-quando">{haQuantoTempo(b.criadoEm, agora)}</span>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const aberto = idAberto && bugs.estado === 'pronto' ? (lista.find((b) => b.id === idAberto) ?? null) : undefined

  return (
    <section className="tela-bugs" aria-label="Bugs">
      {bugs.estado === 'pronto' && (
        <div className="barra">
          <nav className="segmento" aria-label="Status dos bugs">
            {ABAS.map((a) => (
              <a key={a.id} className="segmento-op" href={`#/bugs?f=${a.id}`} aria-current={a.id === aba ? 'true' : undefined}>
                {a.nome}
                <span className="segmento-cont">{daAba(a.id).length}</span>
              </a>
            ))}
          </nav>
          <div className="chips" role="group" aria-label="Filtrar por severidade">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="chip"
                aria-pressed={severidade === f.id}
                onClick={() => setSeveridade(f.id)}
              >
                {f.nome}
              </button>
            ))}
          </div>
        </div>
      )}
      {corpo}
      {aberto !== undefined && <PainelBug bug={aberto} aoFechar={fecharPainel} aoMover={mover} />}
    </section>
  )
}
