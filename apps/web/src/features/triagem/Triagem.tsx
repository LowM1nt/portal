import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { SEVERIDADES, moverBug, type Bug, type Severidade } from '../bugs/api.ts'
import { lerConfigIa } from '../config/api.ts'
import { usePendencias } from '../pendencias/pendencias.ts'
import { haQuantoTempo } from '../revisoes/tempo.ts'
import { useAvisoDeErro, useAvisos } from '../../ui/avisos.ts'
import { Carregando, EstadoErro, EstadoVazio } from '../../ui/Estados.tsx'
import { IconeCheck, IconeDiscord, IconePessoa, IconeTriagem } from '../../ui/icones.tsx'
import { Modal } from '../../ui/Sobreposicao.tsx'
import { erroDoServidor, useCarregar } from '../../ui/useCarregar.ts'
import { INTERVALO_PENDENTE, confianca, evidencias, lerTriagem, triar, type AcaoTriagem, type ItemTriagem, type ResultadoTriagem, type Sugestao } from './api.ts'
import './triagem.css'

const SEVERIDADES_ORDEM: Severidade[] = ['baixa', 'media', 'alta', 'critica']

const hrefBug = (id: string) => `#/bugs/${encodeURIComponent(id)}?f=a_triar`

/** A sugestão tem conteúdo pra mostrar (pronta, ou já usada e o bug voltou pra fila pelo "Desfazer"). */
const comConteudo = (s: Sugestao | null): s is Sugestao => s !== null && ['pronta', 'aprovada', 'ajustada'].includes(s.status)

/**
 * Triagem com IA (D-007, D-014): bugs "a triar" com o que a IA sugeriu. A IA sugere; quem decide é o time:
 * aprovar (usa a severidade sugerida), ajustar (escolhe a severidade) ou descartar a sugestão.
 */
export function Triagem() {
  const { api, workspaceAtivo } = useAuth()
  const { bugs } = usePendencias()
  const { avisar } = useAvisos()
  const escopo = workspaceAtivo?.id ?? null
  const carregar = useCallback(() => lerTriagem(api), [api])
  const carregarIa = useCallback(() => lerConfigIa(api), [api])
  const fila = useCarregar(carregar, escopo)
  // Só para explicar por que um bug não tem sugestão; se não vier, a tela segue sem essa informação.
  const ia = useCarregar(carregarIa, escopo)
  const [agindo, setAgindo] = useState<string | null>(null)
  const [ajustando, setAjustando] = useState<ItemTriagem | null>(null)
  useAvisoDeErro(fila.estado === 'erro', 'A triagem não veio', 'Pode ser a conexão. O botão "Tentar de novo" está logo ali.')

  const lendo = Boolean(fila.dados?.some((i) => i.sugestao?.status === 'pendente'))
  const { atualizar } = fila
  useEffect(() => {
    if (!lendo) return
    const relogio = setInterval(atualizar, INTERVALO_PENDENTE)
    return () => clearInterval(relogio)
  }, [lendo, atualizar])

  /** Troca o bug na lista compartilhada (contadores, Bugs e Início) sem buscar de novo. */
  const trocarBug = (bug: Bug) => bugs.definir((lista) => lista.map((b) => (b.id === bug.id ? bug : b)))

  async function desfazer(bug: Bug) {
    let voltou: Bug | null = null
    try {
      const r = await moverBug(api, bug.id, 'a_triar')
      if (r.ok) voltou = (await r.json()) as Bug
    } catch {
      voltou = null
    }
    if (!voltou?.id) {
      avisar({ tipo: 'erro', titulo: 'Não deu pra desfazer', texto: 'Sem conexão? O bug segue em Em andamento; dá pra voltar ele pela tela de Bugs.' })
      return
    }
    trocarBug(voltou)
    atualizar()
    avisar({ tipo: 'info', titulo: 'Voltou pra fila', texto: `“${voltou.titulo}” está esperando triagem de novo.` })
  }

  /** Devolve true se deu certo (o modal de ajuste fecha). */
  async function agir(item: ItemTriagem, acao: AcaoTriagem, severidade?: Severidade): Promise<boolean> {
    setAgindo(item.bugId)
    let r: Response
    try {
      r = await triar(api, item.bugId, acao, severidade)
    } catch {
      avisar({ tipo: 'erro', titulo: 'Não deu pra triar', texto: 'Sem conexão? Tenta de novo em instantes.' })
      return false
    } finally {
      setAgindo(null)
    }
    if (r.status === 409 || r.status === 404) {
      // Outra pessoa triou antes (ou o bug sumiu): busca a fila de novo.
      avisar({ tipo: 'erro', titulo: 'Esse bug mudou', texto: (await erroDoServidor(r)) ?? 'Alguém já mexeu nele. A fila foi atualizada.' })
      atualizar()
      bugs.atualizar()
      return false
    }
    if (!r.ok) {
      avisar({ tipo: 'erro', titulo: 'Não deu pra triar', texto: (await erroDoServidor(r)) ?? 'Tenta de novo em instantes.' })
      return false
    }
    let resultado: ResultadoTriagem | null
    try {
      resultado = (await r.json()) as ResultadoTriagem
    } catch {
      resultado = null
    }
    if (!resultado?.bug?.id) {
      atualizar()
      bugs.atualizar()
      return true
    }
    const { bug, sugestao } = resultado
    if (acao === 'descartar') {
      fila.definir((lista) => lista.map((i) => (i.bugId === item.bugId ? { ...i, sugestao } : i)))
      avisar({ tipo: 'info', titulo: 'Sugestão descartada', texto: 'Agora é com você: escolha a severidade em “Ajustar”.' })
      return true
    }
    fila.definir((lista) => lista.filter((i) => i.bugId !== item.bugId))
    trocarBug(bug)
    const sev = SEVERIDADES[bug.severidade]?.nome ?? bug.severidade
    avisar({
      tipo: 'ok',
      titulo: acao === 'aprovar' ? 'Sugestão aprovada!' : 'Triagem ajustada!',
      texto: `“${bug.titulo}” foi pra Em andamento como ${sev}.`,
      acao: { rotulo: 'Desfazer', executar: () => void desfazer(bug) },
    })
    return true
  }

  if (fila.estado === 'carregando') {
    return (
      <Carregando className="triagem">
        {[0, 1, 2].map((n) => (
          <span key={n} className="osso osso-tri" />
        ))}
      </Carregando>
    )
  }
  if (fila.estado === 'erro' || !fila.dados) {
    return (
      <div className="cartao">
        <EstadoErro titulo="Ops, não deu pra carregar a triagem." texto="Seus dados estão seguros. Tenta de novo?" aoTentar={fila.recarregar} />
      </div>
    )
  }
  if (fila.dados.length === 0) {
    return (
      <div className="cartao">
        <EstadoVazio
          icone={<IconeCheck />}
          titulo="Fila zerada!"
          texto="Nenhum bug esperando triagem. Os novos chegam aqui sozinhos, do Discord e do time."
          acao={
            <a className="botao botao-secundario" href="#/bugs">
              Ver bugs
            </a>
          }
        />
      </div>
    )
  }

  const agora = new Date()
  const iaLigada = ia.dados ? ia.dados.configurado : null
  return (
    <>
      <ul className="triagem" aria-label="Bugs esperando triagem">
        {fila.dados.map((item) => (
          <CartaoTriagem
            key={item.bugId}
            item={item}
            agora={agora}
            iaLigada={iaLigada}
            ocupado={agindo !== null}
            agindo={agindo === item.bugId}
            aoAgir={(acao) => (acao === 'ajustar' ? setAjustando(item) : void agir(item, acao))}
          />
        ))}
      </ul>
      {ajustando && (
        <AjustarTriagem
          item={ajustando}
          aoFechar={() => setAjustando(null)}
          aoConfirmar={async (sev) => {
            if (await agir(ajustando, 'ajustar', sev)) setAjustando(null)
          }}
        />
      )}
    </>
  )
}

type PropsCartao = {
  item: ItemTriagem
  agora: Date
  iaLigada: boolean | null
  ocupado: boolean
  agindo: boolean
  aoAgir: (acao: AcaoTriagem) => void
}

function CartaoTriagem({ item, agora, iaLigada, ocupado, agindo, aoAgir }: PropsCartao) {
  const id = useId()
  const s = item.sugestao
  const pronta = s?.status === 'pronta'
  const podeDescartar = s?.status === 'pronta' || s?.status === 'falhou'
  const origem = item.origem === 'discord' ? 'Discord' : 'Time'

  return (
    <li className="cartao tri" aria-labelledby={`${id}-t`} data-testid="cartao-triagem">
      <div className="tri-cab">
        <span className="tri-quem">
          {item.origem === 'discord' ? <IconeDiscord /> : <IconePessoa />}
          <span className="tri-quem-txt">
            {origem}
            {item.autor ? ` · ${item.autor}` : ''} · {haQuantoTempo(item.criadoEm, agora)}
          </span>
        </span>
        <h2 id={`${id}-t`} className="tri-titulo">
          <a href={hrefBug(item.bugId)}>{item.titulo}</a>
        </h2>
        {item.relato.trim() && <p className="tri-relato">{item.relato}</p>}
      </div>

      {comConteudo(s) ? <BlocoSugestao sugestao={s} item={item} /> : <SemSugestao sugestao={s} iaLigada={iaLigada} />}

      <div className="tri-acoes">
        {podeDescartar && (
          <button type="button" className="botao botao-fantasma" disabled={ocupado} onClick={() => aoAgir('descartar')}>
            Descartar sugestão
          </button>
        )}
        <button type="button" className={`botao ${pronta ? 'botao-secundario' : 'botao-primario'}`} disabled={ocupado} onClick={() => aoAgir('ajustar')}>
          Ajustar
        </button>
        {pronta && (
          <button type="button" className="botao botao-primario" disabled={ocupado} onClick={() => aoAgir('aprovar')}>
            {agindo ? <span className="giro" aria-hidden="true" /> : <IconeCheck />}
            {agindo ? 'Salvando…' : 'Aprovar'}
          </button>
        )}
      </div>
    </li>
  )
}

/** O que a IA sugeriu: severidade, área, possível duplicado, confiança e evidências. Tudo texto puro. */
function BlocoSugestao({ sugestao: s, item }: { sugestao: Sugestao; item: ItemTriagem }) {
  const sev = s.severidade ? SEVERIDADES[s.severidade] : null
  const nota = confianca(s)
  const lista = evidencias(s)
  const dup = item.possivelDuplicado
  return (
    <div className="tri-sug">
      <div className="tri-sug-cab">
        <span className="secao-t tri-rotulo">
          <IconeTriagem />
          {s.status === 'pronta' ? 'Sugestão da IA' : 'Sugestão da IA (já usada)'}
        </span>
        {nota !== null && <Confianca valor={nota} />}
      </div>
      <div className="tri-selos">
        {sev && <span className={`selo ${sev.classe}`}>{sev.nome}</span>}
        {s.area?.trim() && <span className="fase tri-area">{s.area}</span>}
      </div>
      {dup && (
        <p className="tri-dup">
          <span>Parece com</span>
          <a href={hrefBug(dup.bugId)}>{dup.titulo}</a>
          <span className="tri-dup-nota">{Math.round(dup.similaridade)}% parecido</span>
        </p>
      )}
      {lista.length > 0 && (
        <div className="tri-evid">
          <b>Por que a IA acha isso</b>
          <ul>
            {lista.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Barrinha de confiança (0–100%). */
export function Confianca({ valor }: { valor: number }) {
  return (
    <span className="tri-conf">
      Confiança
      <span className="progresso" role="meter" aria-label="Confiança da IA" aria-valuemin={0} aria-valuemax={100} aria-valuenow={valor}>
        <i style={{ width: `${valor}%` }} />
      </span>
      <b>{valor}%</b>
    </span>
  )
}

function SemSugestao({ sugestao, iaLigada }: { sugestao: Sugestao | null; iaLigada: boolean | null }) {
  const status = sugestao?.status ?? null
  if (status === 'pendente') {
    return (
      <p className="tri-aviso" role="status">
        <span className="giro" aria-hidden="true" />A IA está lendo esse relato…
      </p>
    )
  }
  if (status === 'falhou') {
    return (
      <div className="tri-aviso tri-aviso-erro">
        <b>A IA não conseguiu ler esse relato.</b>
        {sugestao?.erro && <span>{sugestao.erro}</span>}
        <span>Escolha a severidade em “Ajustar”.</span>
      </div>
    )
  }
  if (status === 'descartada') return <p className="tri-aviso">Você descartou a sugestão. Escolha a severidade em “Ajustar”.</p>
  if (status === 'cancelada') return <p className="tri-aviso">A chave da IA saiu antes da leitura, então nada foi enviado. Escolha a severidade em “Ajustar”.</p>
  if (iaLigada === false) {
    return (
      <p className="tri-aviso">
        Sem chave de IA configurada, então esse relato não tem sugestão. <a href="#/config/repositorios">Ligar a IA em Configurações</a>
      </p>
    )
  }
  if (iaLigada) return <p className="tri-aviso">Esse relato chegou antes de a IA ser ligada, então não tem sugestão. Escolha a severidade em “Ajustar”.</p>
  return <p className="tri-aviso">Sem sugestão da IA pra esse relato. Escolha a severidade em “Ajustar”.</p>
}

function AjustarTriagem({ item, aoFechar, aoConfirmar }: { item: ItemTriagem; aoFechar: () => void; aoConfirmar: (s: Severidade) => Promise<void> }) {
  const id = useId()
  const sugerida = item.sugestao?.severidade
  const [severidade, setSeveridade] = useState<Severidade>(sugerida && SEVERIDADES[sugerida] ? sugerida : item.severidade)
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      await aoConfirmar(severidade)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo="Ajustar a triagem" descricao="Você escolhe a severidade e o bug vai pra Em andamento." aoFechar={aoFechar}>
      <form className="form-sobre" onSubmit={(e) => void enviar(e)} noValidate aria-label="Ajustar a triagem">
        <p className="tri-modal-bug">{item.titulo}</p>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-sev`}>
            Severidade
          </label>
          <select id={`${id}-sev`} className="controle" value={severidade} onChange={(e) => setSeveridade(e.target.value as Severidade)}>
            {SEVERIDADES_ORDEM.map((s) => (
              <option key={s} value={s}>
                {SEVERIDADES[s].nome}
                {s === sugerida ? ' (sugestão da IA)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="acoes-sobre">
          <button type="button" className="botao botao-fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-primario" disabled={salvando}>
            {salvando && <span className="giro" aria-hidden="true" />}
            {salvando ? 'Salvando…' : 'Confirmar severidade'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
