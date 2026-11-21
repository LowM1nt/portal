import { useCallback, useId, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useAvisoDeErro, useAvisos } from '../../ui/avisos.ts'
import { Confirmar } from '../../ui/Confirmar.tsx'
import { Carregando, EstadoErro } from '../../ui/Estados.tsx'
import { IconeDiscord, IconeGithub, IconeLink, IconeLixo, IconeNovo, IconeRepositorio } from '../../ui/icones.tsx'
import { Modal } from '../../ui/Sobreposicao.tsx'
import { erroDoServidor, useCarregar } from '../../ui/useCarregar.ts'
import {
  REPOSITORIOS_MAXIMOS,
  lerConfigGithub,
  normalizarRepositorio,
  removerGithub,
  repositorioValido,
  salvarGithub,
  type ConfigGithub,
} from './api.ts'

const data = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

/** "Repositórios e integrações": GitHub (token e repositórios), Discord e Slack em breve. Só o dono edita. */
export function Integracoes() {
  const { api, workspaceAtivo } = useAuth()
  const dono = workspaceAtivo?.papel === 'dono'
  const carregar = useCallback(() => lerConfigGithub(api), [api])
  const recurso = useCarregar(carregar, workspaceAtivo?.id ?? null)
  useAvisoDeErro(recurso.estado === 'erro', 'As integrações não vieram', 'Pode ser a conexão. O botão "Tentar de novo" está logo ali.')

  if (recurso.estado === 'carregando') {
    return (
      <Carregando className="tela-config">
        <div className="integ">
          {[0, 1, 2].map((n) => (
            <span key={n} className="osso osso-integ" />
          ))}
        </div>
        <span className="osso osso-bloco" />
      </Carregando>
    )
  }
  if (recurso.estado === 'erro' || !recurso.dados) {
    return (
      <div className="cartao">
        <EstadoErro titulo="Ops, não deu pra carregar as integrações." texto="Seus dados estão seguros. Tenta de novo?" aoTentar={recurso.recarregar} />
      </div>
    )
  }

  const config = recurso.dados
  const atualizar = (nova: ConfigGithub) => recurso.definir(() => nova)

  return (
    <div className="tela-config">
      {!dono && (
        <p className="faixa-info" role="note">
          Só o dono do workspace muda as integrações. Você vê tudo aqui; se precisar de outro repositório, fala com quem é dono.
        </p>
      )}
      <div className="integ">
        <CartaoGithub config={config} dono={dono} aoMudar={atualizar} />
        <div className="cartao integ-cartao">
          <div className="integ-topo">
            <span className="integ-logo">
              <IconeDiscord />
            </span>
            <span className="fase">Em breve</span>
          </div>
          <b>Discord</b>
          <p>Bugs relatados num canal do Discord viram itens a triar.</p>
        </div>
        <div className="cartao integ-cartao">
          <div className="integ-topo">
            <span className="integ-logo">
              <IconeLink />
            </span>
            <span className="fase">Em breve</span>
          </div>
          <b>Slack</b>
          <p>A mesma integração dos bugs, para quem usa Slack.</p>
        </div>
      </div>
      {/* A chave recria a lista quando a configuração salva muda (salvou, trocou ou removeu o token). */}
      <Repositorios key={`${config.configurado}:${config.repositorios.join(',')}`} config={config} dono={dono} aoMudar={atualizar} />
    </div>
  )
}

type PropsGithub = { config: ConfigGithub; dono: boolean; aoMudar: (c: ConfigGithub) => void }

function CartaoGithub({ config, dono, aoMudar }: PropsGithub) {
  const { api } = useAuth()
  const { avisar } = useAvisos()
  const [trocando, setTrocando] = useState(false)
  const [removendo, setRemovendo] = useState(false)

  let selo
  if (!config.configurado) selo = <span className="selo selo-neutro">Desconectado</span>
  else if (config.ultimoErro) selo = <span className="selo selo-erro">Com erro</span>
  else selo = <span className="selo selo-ok">Conectado</span>

  let sincronizacao = 'Ainda não sincronizou. A primeira leva até 10 minutos.'
  if (config.ultimaSincronizacao) sincronizacao = `Última sincronização: ${dataHora.format(new Date(config.ultimaSincronizacao))}`

  return (
    <div className="cartao integ-cartao">
      <div className="integ-topo">
        <span className="integ-logo">
          <IconeGithub />
        </span>
        {selo}
      </div>
      <b>GitHub</b>
      {config.configurado ? (
        <>
          <p>
            Token configurado{config.configuradoEm ? ` em ${data.format(new Date(config.configuradoEm))}` : ''} · final{' '}
            <span className="mono">••••{config.finalToken}</span>
          </p>
          <p className="integ-sinc">{sincronizacao}</p>
          {config.ultimoErro && (
            <p className="integ-erro" role="status">
              {config.ultimoErro}
            </p>
          )}
          {dono && (
            <div className="integ-acoes">
              <button type="button" className="botao botao-secundario botao-p" onClick={() => setTrocando(true)}>
                Trocar token
              </button>
              <button type="button" className="botao botao-perigo botao-p" onClick={() => setRemovendo(true)}>
                Remover
              </button>
            </div>
          )}
        </>
      ) : (
        <p>PRs abertas e status de CI, com um token só de leitura. {dono ? 'Conecte logo abaixo.' : 'Quem é dono conecta.'}</p>
      )}
      {trocando && (
        <TrocarToken
          repositorios={config.repositorios}
          aoFechar={() => setTrocando(false)}
          aoSalvo={(c) => {
            aoMudar(c)
            setTrocando(false)
            avisar({ tipo: 'ok', titulo: 'Token trocado!', texto: 'A próxima sincronização já usa o token novo.' })
          }}
        />
      )}
      {removendo && (
        <Confirmar
          titulo="Remover o GitHub?"
          texto="O token é apagado e a sincronização para. Os dados já importados continuam. Pra voltar, é só colar um token de novo."
          acao="Remover"
          executando="Removendo…"
          aoFechar={() => setRemovendo(false)}
          aoConfirmar={async () => {
            const r = await removerGithub(api)
            if (!r.ok) return (await erroDoServidor(r)) ?? 'Não deu pra remover agora. Tenta de novo em instantes.'
            aoMudar({ configurado: false, finalToken: null, repositorios: [], ultimaSincronizacao: null, ultimoErro: null })
            avisar({ tipo: 'ok', titulo: 'GitHub removido', texto: 'O token foi apagado. Os dados já importados continuam.' })
          }}
        />
      )}
    </div>
  )
}

function CampoToken({ id, valor, aoMudar, invalido }: { id: string; valor: string; aoMudar: (v: string) => void; invalido: boolean }) {
  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={id}>
        Token do GitHub
      </label>
      <input
        id={id}
        className="controle mono"
        type="password"
        autoComplete="off"
        spellCheck={false}
        maxLength={500}
        placeholder="github_pat_…"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={invalido ? true : undefined}
        aria-describedby={`${id}-ajuda`}
      />
      <span id={`${id}-ajuda`} className="campo-ajuda">
        Token fine-grained só de leitura (Metadata, Pull requests e Commit statuses). Ele fica guardado criptografado e nunca aparece de novo.
      </span>
    </div>
  )
}

function TrocarToken({ repositorios, aoFechar, aoSalvo }: { repositorios: string[]; aoFechar: () => void; aoSalvo: (c: ConfigGithub) => void }) {
  const { api } = useAuth()
  const id = useId()
  const [token, setToken] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!token.trim()) return setErro('Cola o token novo pra trocar.')
    setErro('')
    setSalvando(true)
    try {
      const r = await salvarGithub(api, { token: token.trim(), repositorios })
      if (r.ok) return aoSalvo((await r.json()) as ConfigGithub)
      setErro((await erroDoServidor(r)) ?? 'Não deu pra salvar o token. Tenta de novo em instantes.')
    } catch {
      setErro('Não deu pra salvar. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo="Trocar o token do GitHub" descricao="O token antigo é substituído na hora." aoFechar={aoFechar}>
      <form className="form-sobre" onSubmit={(e) => void enviar(e)} noValidate aria-label="Trocar o token do GitHub">
        <CampoToken id={`${id}-token`} valor={token} aoMudar={setToken} invalido={Boolean(erro)} />
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
        <div className="acoes-sobre">
          <button type="button" className="botao botao-fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-primario" disabled={salvando}>
            {salvando && <span className="giro" aria-hidden="true" />}
            {salvando ? 'Salvando…' : 'Salvar token'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Lista de repositórios (dono/repo). Sem GitHub conectado, o mesmo formulário pede o token. */
function Repositorios({ config, dono, aoMudar }: PropsGithub) {
  const { api } = useAuth()
  const { avisar } = useAvisos()
  const id = useId()
  const [lista, setLista] = useState(config.repositorios)
  const [novo, setNovo] = useState('')
  const [token, setToken] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const mudou = lista.join('\n') !== config.repositorios.join('\n')
  const cheio = lista.length >= REPOSITORIOS_MAXIMOS

  function adicionar() {
    const nome = normalizarRepositorio(novo)
    if (!nome) return
    if (!repositorioValido(nome)) return setErro('Use o formato dono/repo, por exemplo acme/portal.')
    if (lista.some((r) => r.toLowerCase() === nome.toLowerCase())) return setErro('Esse repositório já está na lista.')
    if (cheio) return setErro(`Dá pra acompanhar até ${REPOSITORIOS_MAXIMOS} repositórios por workspace.`)
    setErro('')
    setLista([...lista, nome])
    setNovo('')
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!config.configurado && !token.trim()) return setErro('Cola o token do GitHub pra conectar.')
    setErro('')
    setSalvando(true)
    try {
      const r = await salvarGithub(api, config.configurado ? { repositorios: lista } : { token: token.trim(), repositorios: lista })
      if (r.ok) {
        setToken('')
        aoMudar((await r.json()) as ConfigGithub)
        avisar(
          config.configurado
            ? { tipo: 'ok', titulo: 'Repositórios salvos!', texto: 'A próxima sincronização já usa a lista nova.' }
            : { tipo: 'ok', titulo: 'GitHub conectado!', texto: 'As PRs chegam em até 10 minutos.' },
        )
        return
      }
      setErro((await erroDoServidor(r)) ?? 'Não deu pra salvar. Tenta de novo em instantes.')
    } catch {
      setErro('Não deu pra salvar. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="cartao bloco" aria-labelledby={`${id}-t`}>
      <div className="bloco-cab">
        <h2 id={`${id}-t`}>{config.configurado || !dono ? 'Repositórios' : 'Conectar o GitHub'}</h2>
        <span className="suave contagem">
          {lista.length} de {REPOSITORIOS_MAXIMOS}
        </span>
      </div>
      <form className="config-form" onSubmit={(e) => void salvar(e)} noValidate aria-label="Repositórios do GitHub">
        {dono && !config.configurado && <CampoToken id={`${id}-token`} valor={token} aoMudar={setToken} invalido={Boolean(erro) && !token.trim()} />}
        {lista.length === 0 ? (
          <p className="bloco-vazio">
            {dono ? 'Nenhum repositório ainda. Adicione o primeiro aqui embaixo.' : 'Nenhum repositório configurado ainda.'}
          </p>
        ) : (
          <ul className="lista-cfg" aria-label="Repositórios acompanhados">
            {lista.map((r) => (
              <li key={r}>
                <IconeRepositorio />
                <span className="txt mono">{r}</span>
                {dono && (
                  <button
                    type="button"
                    className="botao botao-fantasma botao-icone botao-p"
                    aria-label={`Tirar ${r} da lista`}
                    onClick={() => setLista(lista.filter((x) => x !== r))}
                  >
                    <IconeLixo />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {dono && (
          <>
            <div className="campo">
              <label className="campo-rotulo" htmlFor={`${id}-novo`}>
                Adicionar repositório
              </label>
              <div className="linha-campo">
                <input
                  id={`${id}-novo`}
                  className="controle mono"
                  placeholder="dono/repo"
                  spellCheck={false}
                  autoComplete="off"
                  value={novo}
                  disabled={cheio}
                  onChange={(e) => setNovo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      adicionar()
                    }
                  }}
                />
                <button type="button" className="botao botao-secundario" onClick={adicionar} disabled={cheio || !novo.trim()}>
                  <IconeNovo />
                  Adicionar
                </button>
              </div>
            </div>
            {erro && (
              <p role="alert" className="campo-erro">
                {erro}
              </p>
            )}
            <div className="acoes-sobre">
              {mudou && config.configurado && (
                <button type="button" className="botao botao-fantasma" onClick={() => setLista(config.repositorios)}>
                  Desfazer mudanças
                </button>
              )}
              <button type="submit" className="botao botao-primario" disabled={salvando || (config.configurado && !mudou)}>
                {salvando && <span className="giro" aria-hidden="true" />}
                {salvando ? 'Salvando…' : config.configurado ? 'Salvar repositórios' : 'Conectar GitHub'}
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  )
}
