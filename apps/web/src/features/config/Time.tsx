import { useCallback, useId, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useAvisoDeErro, useAvisos } from '../../ui/avisos.ts'
import { Confirmar } from '../../ui/Confirmar.tsx'
import { Carregando, EstadoErro } from '../../ui/Estados.tsx'
import { IconeCheck, IconeCopiar, IconeEnvelope, IconeLixo, IconeNovo } from '../../ui/icones.tsx'
import { Modal } from '../../ui/Sobreposicao.tsx'
import { erroDoServidor, lerLista, useCarregar } from '../../ui/useCarregar.ts'
import { PAPEIS, json, type ConviteCriado, type ConvitePendente, type Membro, type Papel } from './api.ts'

const diaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

const inicial = (email: string | null) => (email?.trim()[0] ?? '?').toUpperCase()

/** "Time e workspace": membros com papel, convites pendentes e convidar. Só o dono muda. */
export function Time() {
  const { api, workspaceAtivo } = useAuth()
  const dono = workspaceAtivo?.papel === 'dono'
  const carregar = useCallback(async () => {
    const [membros, convites] = await Promise.all([
      lerLista<Membro>(api('/api/workspace/membros')),
      // Convites pendentes só o dono vê (a API devolve 403 para os outros).
      dono ? lerLista<ConvitePendente>(api('/api/workspace/convites')) : Promise.resolve<ConvitePendente[]>([]),
    ])
    return { membros, convites }
  }, [api, dono])
  const recurso = useCarregar(carregar, workspaceAtivo ? `${workspaceAtivo.id}#${dono}` : null)
  useAvisoDeErro(recurso.estado === 'erro', 'O time não veio', 'Pode ser a conexão. O botão "Tentar de novo" está logo ali.')
  const [convidando, setConvidando] = useState(false)

  if (recurso.estado === 'carregando') {
    return (
      <Carregando className="tela-config">
        <span className="osso osso-bloco" />
        <span className="osso osso-bloco" />
      </Carregando>
    )
  }
  if (recurso.estado === 'erro' || !recurso.dados) {
    return (
      <div className="cartao">
        <EstadoErro titulo="Ops, não deu pra carregar o time." texto="Seus dados estão seguros. Tenta de novo?" aoTentar={recurso.recarregar} />
      </div>
    )
  }

  const { membros, convites } = recurso.dados

  return (
    <div className="tela-config">
      <section className="cartao bloco" aria-labelledby="time-ws">
        <div className="bloco-cab">
          <h2 id="time-ws">Workspace</h2>
          <span className={`selo ${PAPEIS[workspaceAtivo?.papel as Papel]?.classe ?? 'selo-neutro'}`}>
            Você é {PAPEIS[workspaceAtivo?.papel as Papel]?.nome.toLowerCase() ?? workspaceAtivo?.papel}
          </span>
        </div>
        <div className="lista-cfg">
          <div className="linha-cfg">
            <span className="txt">
              <b>{workspaceAtivo?.nome}</b>
              <span>
                {membros.length} {membros.length === 1 ? 'pessoa' : 'pessoas'} no time
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="cartao bloco" aria-labelledby="time-membros">
        <div className="bloco-cab">
          <h2 id="time-membros">Membros</h2>
          {dono && (
            <button type="button" className="botao botao-primario botao-p" onClick={() => setConvidando(true)}>
              <IconeNovo />
              Convidar
            </button>
          )}
        </div>
        {!dono && (
          <p className="nota nota-bloco">Só quem é dono convida, muda papéis e remove pessoas. Admin, por enquanto, tem os mesmos poderes de membro.</p>
        )}
        <ul className="lista-cfg" aria-label="Membros do workspace">
          {membros.map((m) => (
            <LinhaMembro
              key={m.usuarioId}
              membro={m}
              dono={dono}
              aoMudar={(novo) => recurso.definir((d) => ({ ...d, membros: d.membros.map((x) => (x.usuarioId === novo.usuarioId ? novo : x)) }))}
              aoRemover={() => recurso.definir((d) => ({ ...d, membros: d.membros.filter((x) => x.usuarioId !== m.usuarioId) }))}
            />
          ))}
        </ul>
      </section>

      {dono && (
        <section className="cartao bloco" aria-labelledby="time-convites">
          <div className="bloco-cab">
            <h2 id="time-convites">Convites pendentes</h2>
            <span className="suave contagem">{convites.length}</span>
          </div>
          {convites.length === 0 ? (
            <p className="bloco-vazio">Nenhum convite esperando resposta.</p>
          ) : (
            <ul className="lista-cfg" aria-label="Convites pendentes">
              {convites.map((c) => (
                <LinhaConvite
                  key={c.id}
                  convite={c}
                  aoRevogar={() => recurso.definir((d) => ({ ...d, convites: d.convites.filter((x) => x.id !== c.id) }))}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="cartao bloco" aria-labelledby="time-perigo">
        <div className="bloco-cab">
          <h2 id="time-perigo" className="titulo-perigo">
            Zona de perigo
          </h2>
        </div>
        <p className="nota nota-bloco">
          Excluir o workspace ainda não está disponível por aqui. Se precisar apagar tudo (deploys, bugs e roadmap), fala com o suporte do Releasy.
        </p>
      </section>

      {convidando && (
        <Convidar
          aoFechar={() => setConvidando(false)}
          aoCriado={(c) => recurso.definir((d) => ({ ...d, convites: [c, ...d.convites] }))}
        />
      )}
    </div>
  )
}

type PropsMembro = { membro: Membro; dono: boolean; aoMudar: (m: Membro) => void; aoRemover: () => void }

function LinhaMembro({ membro, dono, aoMudar, aoRemover }: PropsMembro) {
  const { api } = useAuth()
  const { avisar } = useAvisos()
  const id = useId()
  const [mudando, setMudando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const papel = PAPEIS[membro.papel] ?? PAPEIS.membro
  const nome = membro.email ?? 'Sem e-mail'

  async function mudarPapel(novo: Papel) {
    setMudando(true)
    try {
      const r = await api(`/api/workspace/membros/${encodeURIComponent(membro.usuarioId)}`, { method: 'PATCH', ...json({ papel: novo }) })
      if (r.ok) {
        aoMudar((await r.json()) as Membro)
        avisar({ tipo: 'ok', titulo: 'Papel trocado!', texto: `${nome} agora é ${PAPEIS[novo].nome.toLowerCase()}.` })
      } else if (r.status !== 401) {
        // Ex.: 409 do último dono; a mensagem da API diz o que fazer.
        avisar({ tipo: 'erro', titulo: 'Não deu pra trocar o papel', texto: (await erroDoServidor(r)) ?? 'Tenta de novo em instantes.' })
      }
    } catch {
      avisar({ tipo: 'erro', titulo: 'Não deu pra trocar o papel', texto: 'Sem conexão? Tenta de novo em instantes.' })
    } finally {
      setMudando(false)
    }
  }

  return (
    <li className="linha-cfg">
      <span className="avatar avatar-g" aria-hidden="true">
        {inicial(membro.email)}
      </span>
      <span className="txt">
        <b>
          {nome}
          {membro.voce && <span className="voce"> (você)</span>}
        </b>
        <span>{papel.ajuda}</span>
      </span>
      {dono && !membro.voce ? (
        <>
          <label className="sr" htmlFor={`${id}-papel`}>
            Papel de {nome}
          </label>
          <select
            id={`${id}-papel`}
            className="controle controle-p seletor-papel"
            value={membro.papel}
            disabled={mudando}
            onChange={(e) => void mudarPapel(e.target.value as Papel)}
          >
            {(Object.keys(PAPEIS) as Papel[]).map((p) => (
              <option key={p} value={p}>
                {PAPEIS[p].nome}
              </option>
            ))}
          </select>
          <button type="button" className="botao botao-fantasma botao-icone botao-p" aria-label={`Remover ${nome}`} onClick={() => setRemovendo(true)}>
            <IconeLixo />
          </button>
        </>
      ) : (
        <span className={`selo ${papel.classe}`}>{papel.nome}</span>
      )}
      {removendo && (
        <Confirmar
          titulo={`Remover ${nome}?`}
          texto="A pessoa perde o acesso ao workspace na hora. Pra voltar, é só convidar de novo."
          acao="Remover"
          executando="Removendo…"
          aoFechar={() => setRemovendo(false)}
          aoConfirmar={async () => {
            const r = await api(`/api/workspace/membros/${encodeURIComponent(membro.usuarioId)}`, { method: 'DELETE' })
            if (!r.ok) return (await erroDoServidor(r)) ?? 'Não deu pra remover agora. Tenta de novo em instantes.'
            aoRemover()
            avisar({ tipo: 'ok', titulo: 'Pessoa removida', texto: `${nome} não faz mais parte do workspace.` })
          }}
        />
      )}
    </li>
  )
}

function LinhaConvite({ convite, aoRevogar }: { convite: ConvitePendente; aoRevogar: () => void }) {
  const { api } = useAuth()
  const { avisar } = useAvisos()
  const [revogando, setRevogando] = useState(false)
  const papel = PAPEIS[convite.papel] ?? PAPEIS.membro
  return (
    <li className="linha-cfg">
      <span className="integ-logo integ-logo-p" aria-hidden="true">
        <IconeEnvelope />
      </span>
      <span className="txt">
        <b>{convite.email}</b>
        <span>
          {papel.nome} · vale até {diaMes.format(new Date(convite.expiraEm))}
        </span>
      </span>
      <button type="button" className="botao botao-secundario botao-p" onClick={() => setRevogando(true)}>
        Revogar
      </button>
      {revogando && (
        <Confirmar
          titulo="Revogar o convite?"
          texto={`O link enviado para ${convite.email} para de valer na hora.`}
          acao="Revogar"
          executando="Revogando…"
          aoFechar={() => setRevogando(false)}
          aoConfirmar={async () => {
            const r = await api(`/api/workspace/convites/${encodeURIComponent(convite.id)}`, { method: 'DELETE' })
            if (!r.ok && r.status !== 404) return (await erroDoServidor(r)) ?? 'Não deu pra revogar agora. Tenta de novo em instantes.'
            aoRevogar()
            avisar({ tipo: 'ok', titulo: 'Convite revogado', texto: 'Aquele link não entra mais no workspace.' })
          }}
        />
      )}
    </li>
  )
}

/** Modal de convite: cria e mostra o link uma vez, com copiar. Também usado nos Primeiros passos. */
export function Convidar({ aoFechar, aoCriado }: { aoFechar: () => void; aoCriado: (c: ConvitePendente) => void }) {
  const { api } = useAuth()
  const id = useId()
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Exclude<Papel, 'dono'>>('membro')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  // O link só existe aqui, em memória, até fechar o modal: a API não devolve de novo.
  const [link, setLink] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const limpo = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)) return setErro('Informe um e-mail válido, tipo nome@empresa.com.')
    setErro('')
    setEnviando(true)
    try {
      const r = await api('/api/workspace/convites', { method: 'POST', ...json({ email: limpo, papel }) })
      if (r.ok) {
        const criado = (await r.json()) as ConviteCriado
        const { link: novoLink, ...pendente } = criado
        aoCriado({ ...pendente, criadoEm: new Date().toISOString() })
        setLink(novoLink)
        return
      }
      if (r.status !== 401) setErro((await erroDoServidor(r)) ?? 'Não deu pra criar o convite. Tenta de novo em instantes.')
    } catch {
      setErro('Não deu pra criar o convite. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  async function copiar() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
    } catch {
      setCopiado(false)
      setErro('Não deu pra copiar sozinho. Seleciona o link e copia com Ctrl+C.')
    }
  }

  if (link) {
    return (
      <Modal titulo="Convite criado!" descricao={`Manda este link para ${email.trim()}. Ele vale por 7 dias e só pode ser usado uma vez.`} aoFechar={aoFechar}>
        <div className="form-sobre">
          <div className="campo">
            <label className="campo-rotulo" htmlFor={`${id}-link`}>
              Link do convite
            </label>
            <div className="linha-campo">
              <input id={`${id}-link`} className="controle mono" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="botao botao-primario" onClick={() => void copiar()}>
                {copiado ? <IconeCheck /> : <IconeCopiar />}
                {copiado ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
          <p className="faixa-aviso" role="note">
            <b>Copie agora:</b> por segurança, ele não aparece de novo. Se perder, revogue e crie outro convite.
          </p>
          {erro && (
            <p role="alert" className="campo-erro">
              {erro}
            </p>
          )}
          <div className="acoes-sobre">
            <button type="button" className="botao botao-secundario" onClick={aoFechar}>
              Pronto
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal titulo="Convidar pro time" descricao="A pessoa entra com o e-mail convidado. Sem e-mail automático por enquanto: você copia o link." aoFechar={aoFechar}>
      <form className="form-sobre" onSubmit={(e) => void enviar(e)} noValidate aria-label="Convidar pro time">
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-email`}>
            E-mail
          </label>
          <input
            id={`${id}-email`}
            className="controle"
            type="email"
            autoComplete="off"
            placeholder="nome@empresa.com"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={erro ? true : undefined}
          />
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-papel`}>
            Papel
          </label>
          <select id={`${id}-papel`} className="controle" value={papel} onChange={(e) => setPapel(e.target.value as 'membro' | 'admin')}>
            <option value="membro">Membro</option>
            <option value="admin">Admin</option>
          </select>
          <span className="campo-ajuda">Dono, só promovendo depois que a pessoa entrar.</span>
        </div>
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
        <div className="acoes-sobre">
          <button type="button" className="botao botao-fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando && <span className="giro" aria-hidden="true" />}
            {enviando ? 'Criando…' : 'Criar convite'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
