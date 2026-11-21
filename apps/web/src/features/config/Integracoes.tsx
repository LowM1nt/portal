import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useAvisoDeErro, useAvisos } from '../../ui/avisos.ts'
import { Confirmar } from '../../ui/Confirmar.tsx'
import { Carregando, EstadoErro } from '../../ui/Estados.tsx'
import { IconeDiscord, IconeGithub, IconeLixo, IconeNovo, IconeRepositorio, IconeTriagem } from '../../ui/icones.tsx'
import { Modal } from '../../ui/Sobreposicao.tsx'
import { erroDoServidor, useCarregar, type Recurso } from '../../ui/useCarregar.ts'
import {
  LIMITE_CHAVE_IA,
  LIMITE_TOKEN_DISCORD,
  PROVEDORES_IA,
  REPOSITORIOS_MAXIMOS,
  canalValido,
  lerConfigDiscord,
  lerConfigGithub,
  lerConfigIa,
  nomeProvedor,
  normalizarRepositorio,
  removerDiscord,
  removerGithub,
  removerIa,
  repositorioValido,
  salvarDiscord,
  salvarGithub,
  salvarIa,
  type ConfigDiscord,
  type ConfigGithub,
  type ConfigIa,
} from './api.ts'

const data = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

/**
 * "Repositórios e integrações": GitHub (token e repositórios), bot do Discord e chave da IA. Só o dono edita.
 * Discord e IA carregam cada um no seu cartão: se um falhar, o resto da tela continua.
 */
export function Integracoes() {
  const { api, workspaceAtivo } = useAuth()
  const { avisar } = useAvisos()
  const dono = workspaceAtivo?.papel === 'dono'
  const escopo = workspaceAtivo?.id ?? null
  const carregar = useCallback(() => lerConfigGithub(api), [api])
  const carregarDiscord = useCallback(() => lerConfigDiscord(api), [api])
  const carregarIa = useCallback(() => lerConfigIa(api), [api])
  const recurso = useCarregar(carregar, escopo)
  const discord = useCarregar(carregarDiscord, escopo)
  const ia = useCarregar(carregarIa, escopo)
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
        <CartaoDiscord recurso={discord} dono={dono} />
        <CartaoIa recurso={ia} dono={dono} />
      </div>
      {/* A chave recria a lista quando a configuração salva muda (salvou, trocou ou removeu o token). */}
      <Repositorios key={`${config.configurado}:${config.repositorios.join(',')}`} config={config} dono={dono} aoMudar={atualizar} />
      {dono && discord.dados && !discord.dados.configurado && (
        <ConectarDiscord
          aoSalvo={(c) => {
            discord.definir(() => c)
            avisar({ tipo: 'ok', titulo: 'Discord conectado!', texto: 'As mensagens novas do canal viram bugs a triar em até 1 minuto.' })
          }}
        />
      )}
      {dono && ia.dados && !ia.dados.configurado && (
        <LigarIa
          aoSalvo={(c) => {
            ia.definir(() => c)
            avisar({ tipo: 'ok', titulo: 'IA ligada!', texto: 'Os próximos bugs já chegam na Triagem com a sugestão da IA.' })
          }}
        />
      )}
    </div>
  )
}

const dataHoraDe = (iso: string | null | undefined) => (iso ? dataHora.format(new Date(iso)) : null)

/** Cartão de uma integração que carrega sozinha: o esqueleto e o erro ficam no próprio cartão. */
function CartaoCarregando({ icone, nome, recurso }: { icone: ReactNode; nome: string; recurso: Pick<Recurso<unknown>, 'estado' | 'recarregar'> }) {
  if (recurso.estado === 'carregando') {
    return (
      <div className="cartao integ-cartao" aria-busy="true">
        <div className="integ-topo">
          <span className="integ-logo">{icone}</span>
        </div>
        <b>{nome}</b>
        <span className="sr">Carregando…</span>
        <span className="osso osso-linha" aria-hidden="true" />
        <span className="osso osso-linha osso-linha-curta" aria-hidden="true" />
      </div>
    )
  }
  return (
    <div className="cartao integ-cartao">
      <div className="integ-topo">
        <span className="integ-logo">{icone}</span>
        <span className="selo selo-erro">Sem resposta</span>
      </div>
      <b>{nome}</b>
      <p>Não deu pra ler essa integração agora. Seus dados estão seguros.</p>
      <div className="integ-acoes">
        <button type="button" className="botao botao-secundario botao-p" onClick={recurso.recarregar}>
          Tentar de novo
        </button>
      </div>
    </div>
  )
}

function CartaoDiscord({ recurso, dono }: { recurso: Recurso<ConfigDiscord>; dono: boolean }) {
  const { api } = useAuth()
  const { avisar } = useAvisos()
  const [trocando, setTrocando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  if (recurso.estado !== 'pronto' || !recurso.dados) return <CartaoCarregando icone={<IconeDiscord />} nome="Discord" recurso={recurso} />
  const config = recurso.dados

  let selo
  if (!config.configurado) selo = <span className="selo selo-neutro">Desconectado</span>
  else if (config.ultimoErro) selo = <span className="selo selo-erro">Com erro</span>
  else selo = <span className="selo selo-ok">Conectado</span>

  const leitura = dataHoraDe(config.ultimaLeitura)

  return (
    <div className="cartao integ-cartao">
      <div className="integ-topo">
        <span className="integ-logo">
          <IconeDiscord />
        </span>
        {selo}
      </div>
      <b>Discord</b>
      {config.configurado ? (
        <>
          <p>
            Bot com token final <span className="mono">••••{config.finalToken}</span> lendo o canal{' '}
            <span className="mono">{config.canalId}</span>
          </p>
          <p className="integ-sinc">{leitura ? `Última leitura: ${leitura}` : 'Ainda não leu o canal. A primeira leitura leva até 1 minuto.'}</p>
          {config.ultimoErro && (
            <p className="integ-erro" role="status">
              {config.ultimoErro}
            </p>
          )}
          {dono && (
            <div className="integ-acoes">
              <button type="button" className="botao botao-secundario botao-p" onClick={() => setTrocando(true)}>
                Trocar
              </button>
              <button type="button" className="botao botao-perigo botao-p" onClick={() => setRemovendo(true)}>
                Remover
              </button>
            </div>
          )}
        </>
      ) : (
        <p>Cada mensagem num canal de bugs do Discord vira um bug a triar. {dono ? 'Conecte logo abaixo.' : 'Quem é dono conecta.'}</p>
      )}
      {trocando && (
        <TrocarDiscord
          config={config}
          aoFechar={() => setTrocando(false)}
          aoSalvo={(c) => {
            recurso.definir(() => c)
            setTrocando(false)
            avisar({ tipo: 'ok', titulo: 'Discord atualizado!', texto: 'A próxima leitura do canal já usa o que você mudou.' })
          }}
        />
      )}
      {removendo && (
        <Confirmar
          titulo="Remover o Discord?"
          texto="O token do bot é apagado e o canal para de ser lido. Os bugs que já vieram de lá continuam."
          acao="Remover"
          executando="Removendo…"
          aoFechar={() => setRemovendo(false)}
          aoConfirmar={async () => {
            const r = await removerDiscord(api)
            if (!r.ok) return (await erroDoServidor(r)) ?? 'Não deu pra remover agora. Tenta de novo em instantes.'
            recurso.definir(() => ({ configurado: false, finalToken: null, canalId: null, ultimaLeitura: null, ultimoErro: null }))
            avisar({ tipo: 'ok', titulo: 'Discord removido', texto: 'O token foi apagado. Os bugs que já vieram continuam.' })
          }}
        />
      )}
    </div>
  )
}

function CartaoIa({ recurso, dono }: { recurso: Recurso<ConfigIa>; dono: boolean }) {
  const { api } = useAuth()
  const { avisar } = useAvisos()
  const [trocando, setTrocando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  if (recurso.estado !== 'pronto' || !recurso.dados) return <CartaoCarregando icone={<IconeTriagem />} nome="Triagem com IA" recurso={recurso} />
  const config = recurso.dados

  return (
    <div className="cartao integ-cartao">
      <div className="integ-topo">
        <span className="integ-logo">
          <IconeTriagem />
        </span>
        {config.configurado ? <span className="selo selo-ok">Ligada</span> : <span className="selo selo-neutro">Desligada</span>}
      </div>
      <b>Triagem com IA</b>
      {config.configurado ? (
        <>
          <p>
            {nomeProvedor(config.provedor)}, com a chave do workspace. Ela fica guardada criptografada e não aparece de novo.
          </p>
          <p className="integ-sinc">A IA sugere; você decide na Triagem.</p>
          {dono && (
            <div className="integ-acoes">
              <button type="button" className="botao botao-secundario botao-p" onClick={() => setTrocando(true)}>
                Trocar chave
              </button>
              <button type="button" className="botao botao-perigo botao-p" onClick={() => setRemovendo(true)}>
                Remover
              </button>
            </div>
          )}
        </>
      ) : (
        <p>A IA lê o relato e sugere severidade, área e passos; você aprova. {dono ? 'Ligue logo abaixo.' : 'Quem é dono liga.'}</p>
      )}
      {trocando && (
        <TrocarChaveIa
          provedor={config.provedor}
          aoFechar={() => setTrocando(false)}
          aoSalvo={(c) => {
            recurso.definir(() => c)
            setTrocando(false)
            avisar({ tipo: 'ok', titulo: 'Chave trocada!', texto: 'Os próximos relatos já usam a chave nova.' })
          }}
        />
      )}
      {removendo && (
        <Confirmar
          titulo="Remover a chave da IA?"
          texto="A chave é apagada e nenhum relato novo vai pra IA. As sugestões que já chegaram continuam na Triagem."
          acao="Remover"
          executando="Removendo…"
          aoFechar={() => setRemovendo(false)}
          aoConfirmar={async () => {
            const r = await removerIa(api)
            if (!r.ok) return (await erroDoServidor(r)) ?? 'Não deu pra remover agora. Tenta de novo em instantes.'
            recurso.definir(() => ({ configurado: false, provedor: null }))
            avisar({ tipo: 'ok', titulo: 'Chave da IA removida', texto: 'Nada mais vai pra IA. A triagem segue manual.' })
          }}
        />
      )}
    </div>
  )
}

const LINK_EXTERNO = { target: '_blank', rel: 'noopener noreferrer' } as const

/** Passo a passo do bot do Discord (D-014: intent Message Content e permissão de ler o canal). */
function PassosDiscord() {
  return (
    <div className="onb-dica">
      <b>Como criar o bot (uns 5 minutos)</b>
      <ol>
        <li>
          Abre{' '}
          <a href="https://discord.com/developers/applications" {...LINK_EXTERNO}>
            discord.com/developers
          </a>
          , clica em “New Application” e dá um nome (ex.: Releasy).
        </li>
        <li>Na seção “Bot”, liga o “Message Content Intent”. Sem ele o bot só enxerga mensagens vazias.</li>
        <li>Ainda em “Bot”, clica em “Reset Token”, copia o token e cola aqui embaixo.</li>
        <li>
          Em “OAuth2 › URL Generator”, marca “bot” com “View Channels” e “Read Message History”, abre o link gerado e convida o bot
          pro seu servidor.
        </li>
        <li>No Discord, liga o Modo desenvolvedor (Configurações › Avançado), clica com o botão direito no canal de bugs e em “Copiar ID do canal”.</li>
      </ol>
    </div>
  )
}

function CampoCanal({ id, valor, aoMudar, invalido }: { id: string; valor: string; aoMudar: (v: string) => void; invalido: boolean }) {
  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={id}>
        ID do canal
      </label>
      <input
        id={id}
        className="controle mono"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        maxLength={20}
        placeholder="123456789012345678"
        value={valor}
        onChange={(e) => aoMudar(e.target.value.trim())}
        aria-invalid={invalido ? true : undefined}
        aria-describedby={`${id}-ajuda`}
      />
      <span id={`${id}-ajuda`} className="campo-ajuda">
        Só números. O histórico antigo do canal fica de fora.
      </span>
    </div>
  )
}

const ERRO_CANAL = 'O ID do canal tem de 17 a 20 números. Copia de novo no Discord (botão direito no canal › Copiar ID).'

const ajudaTokenDiscord = 'Fica guardado criptografado e nunca aparece de novo (só o final).'

/** Valida e manda o PUT do Discord. Devolve a configuração salva ou a mensagem de erro. */
async function enviarDiscord(api: ReturnType<typeof useAuth>['api'], token: string, canal: string): Promise<ConfigDiscord | string> {
  try {
    const r = await salvarDiscord(api, token ? { token, canalId: canal } : { canalId: canal })
    if (r.ok) return (await r.json()) as ConfigDiscord
    return (await erroDoServidor(r)) ?? 'Não deu pra salvar. Tenta de novo em instantes.'
  } catch {
    return 'Não deu pra salvar. Sem conexão? Tenta de novo em instantes.'
  }
}

function ConectarDiscord({ aoSalvo }: { aoSalvo: (c: ConfigDiscord) => void }) {
  const { api } = useAuth()
  const id = useId()
  const [token, setToken] = useState('')
  const [canal, setCanal] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!token.trim()) return setErro('Cola o token do bot pra conectar.')
    if (!canalValido(canal)) return setErro(ERRO_CANAL)
    setErro('')
    setSalvando(true)
    const r = await enviarDiscord(api, token.trim(), canal)
    setSalvando(false)
    if (typeof r === 'string') return setErro(r)
    setToken('')
    aoSalvo(r)
  }

  return (
    <section className="cartao bloco" aria-labelledby={`${id}-t`}>
      <div className="bloco-cab">
        <h2 id={`${id}-t`}>Conectar o Discord</h2>
      </div>
      <form className="config-form" onSubmit={(e) => void enviar(e)} noValidate aria-label="Conectar o Discord">
        <PassosDiscord />
        <div className="duas-colunas">
          <CampoToken
            id={`${id}-token`}
            rotulo="Token do bot"
            placeholder="Cole o token do bot"
            ajuda={ajudaTokenDiscord}
            maxLength={LIMITE_TOKEN_DISCORD}
            valor={token}
            aoMudar={setToken}
            invalido={Boolean(erro) && !token.trim()}
          />
          <CampoCanal id={`${id}-canal`} valor={canal} aoMudar={setCanal} invalido={Boolean(erro) && Boolean(token.trim()) && !canalValido(canal)} />
        </div>
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
        <div className="acoes-sobre">
          <button type="submit" className="botao botao-primario" disabled={salvando}>
            {salvando && <span className="giro" aria-hidden="true" />}
            {salvando ? 'Conectando…' : 'Conectar Discord'}
          </button>
        </div>
      </form>
    </section>
  )
}

function TrocarDiscord({ config, aoFechar, aoSalvo }: { config: ConfigDiscord; aoFechar: () => void; aoSalvo: (c: ConfigDiscord) => void }) {
  const { api } = useAuth()
  const id = useId()
  const [token, setToken] = useState('')
  const [canal, setCanal] = useState(config.canalId ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!token.trim() && canal === config.canalId) return setErro('Cola um token novo ou troca o canal pra salvar.')
    if (!canalValido(canal)) return setErro(ERRO_CANAL)
    setErro('')
    setSalvando(true)
    const r = await enviarDiscord(api, token.trim(), canal)
    setSalvando(false)
    if (typeof r === 'string') return setErro(r)
    setToken('')
    aoSalvo(r)
  }

  return (
    <Modal titulo="Trocar o Discord" descricao="Deixe o token em branco pra manter o atual. Trocar o canal começa a ler do zero." aoFechar={aoFechar}>
      <form className="form-sobre" onSubmit={(e) => void enviar(e)} noValidate aria-label="Trocar o Discord">
        <CampoToken
          id={`${id}-token`}
          rotulo="Token novo do bot (opcional)"
          placeholder="Cole o token novo"
          ajuda={ajudaTokenDiscord}
          maxLength={LIMITE_TOKEN_DISCORD}
          valor={token}
          aoMudar={setToken}
          invalido={false}
        />
        <CampoCanal id={`${id}-canal`} valor={canal} aoMudar={setCanal} invalido={Boolean(erro) && !canalValido(canal)} />
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
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Passo a passo da chave gratuita do Gemini, com os avisos de limite e de privacidade. */
function PassosIa() {
  return (
    <>
      <div className="onb-dica">
        <b>Como pegar uma chave grátis do Gemini</b>
        <ol>
          <li>
            Abre{' '}
            <a href="https://aistudio.google.com/apikey" {...LINK_EXTERNO}>
              aistudio.google.com
            </a>{' '}
            e entra com uma conta Google.
          </li>
          <li>Clica em “Get API key” e depois em “Create API key” (escolhe ou cria um projeto).</li>
          <li>Copia a chave e cola aqui embaixo.</li>
        </ol>
      </div>
      <p className="faixa-aviso" role="note">
        <b>Antes de ligar:</b> o plano grátis tem limite de pedidos por minuto e por dia; se estourar, a sugestão chega mais tarde. O
        título e o relato de cada bug novo vão pro Google pra IA ler, e no plano grátis o Google pode usar esse conteúdo pra melhorar
        os produtos dele. Nada de senha ou dado pessoal no relato.
      </p>
    </>
  )
}

function CampoProvedor({ id, valor, aoMudar }: { id: string; valor: string; aoMudar: (v: string) => void }) {
  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={id}>
        Provedor
      </label>
      <select id={id} className="controle" value={valor} onChange={(e) => aoMudar(e.target.value)}>
        {PROVEDORES_IA.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
    </div>
  )
}

const ajudaChaveIa = 'Fica guardada criptografada e nunca aparece de novo, nem o final.'

/** Valida e manda o PUT da IA. Devolve a configuração salva ou a mensagem de erro. */
async function enviarIa(api: ReturnType<typeof useAuth>['api'], provedor: string, chave: string): Promise<ConfigIa | string> {
  try {
    const r = await salvarIa(api, { provedor, chave })
    if (r.ok) return (await r.json()) as ConfigIa
    return (await erroDoServidor(r)) ?? 'Não deu pra salvar a chave. Tenta de novo em instantes.'
  } catch {
    return 'Não deu pra salvar. Sem conexão? Tenta de novo em instantes.'
  }
}

function LigarIa({ aoSalvo }: { aoSalvo: (c: ConfigIa) => void }) {
  const { api } = useAuth()
  const id = useId()
  const [provedor, setProvedor] = useState<string>(PROVEDORES_IA[0].id)
  const [chave, setChave] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!chave.trim()) return setErro('Cola a chave da IA pra salvar.')
    setErro('')
    setSalvando(true)
    const r = await enviarIa(api, provedor, chave.trim())
    setSalvando(false)
    if (typeof r === 'string') return setErro(r)
    setChave('')
    aoSalvo(r)
  }

  return (
    <section className="cartao bloco" aria-labelledby={`${id}-t`}>
      <div className="bloco-cab">
        <h2 id={`${id}-t`}>Ligar a triagem com IA</h2>
      </div>
      <form className="config-form" onSubmit={(e) => void enviar(e)} noValidate aria-label="Ligar a triagem com IA">
        <PassosIa />
        <div className="duas-colunas campos-ia">
          <CampoProvedor id={`${id}-provedor`} valor={provedor} aoMudar={setProvedor} />
          <CampoToken
            id={`${id}-chave`}
            rotulo="Chave da IA"
            placeholder="Cole a chave da API"
            ajuda={ajudaChaveIa}
            maxLength={LIMITE_CHAVE_IA}
            valor={chave}
            aoMudar={setChave}
            invalido={Boolean(erro)}
          />
        </div>
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
        <div className="acoes-sobre">
          <button type="submit" className="botao botao-primario" disabled={salvando}>
            {salvando && <span className="giro" aria-hidden="true" />}
            {salvando ? 'Ligando…' : 'Ligar a IA'}
          </button>
        </div>
      </form>
    </section>
  )
}

function TrocarChaveIa({ provedor: atual, aoFechar, aoSalvo }: { provedor: string | null; aoFechar: () => void; aoSalvo: (c: ConfigIa) => void }) {
  const { api } = useAuth()
  const id = useId()
  const [provedor, setProvedor] = useState<string>(atual ?? PROVEDORES_IA[0].id)
  const [chave, setChave] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!chave.trim()) return setErro('Cola a chave da IA pra salvar.')
    setErro('')
    setSalvando(true)
    const r = await enviarIa(api, provedor, chave.trim())
    setSalvando(false)
    if (typeof r === 'string') return setErro(r)
    setChave('')
    aoSalvo(r)
  }

  return (
    <Modal titulo="Trocar a chave da IA" descricao="A chave antiga é substituída na hora." aoFechar={aoFechar}>
      <form className="form-sobre" onSubmit={(e) => void enviar(e)} noValidate aria-label="Trocar a chave da IA">
        <CampoProvedor id={`${id}-provedor`} valor={provedor} aoMudar={setProvedor} />
        <CampoToken
          id={`${id}-chave`}
          rotulo="Chave da IA"
          placeholder="Cole a chave nova"
          ajuda={ajudaChaveIa}
          maxLength={LIMITE_CHAVE_IA}
          valor={chave}
          aoMudar={setChave}
          invalido={Boolean(erro)}
        />
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
            {salvando ? 'Salvando…' : 'Salvar chave'}
          </button>
        </div>
      </form>
    </Modal>
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

type PropsCampoToken = {
  id: string
  valor: string
  aoMudar: (v: string) => void
  invalido: boolean
  rotulo?: string
  placeholder?: string
  ajuda?: string
  maxLength?: number
}

/**
 * Campo de segredo (senha, sem autocompletar): token do GitHub por padrão, também o token do bot do Discord e a
 * chave da IA. O valor só vive no formulário: depois de salvar, quem usa limpa o estado e ele nunca volta.
 */
export function CampoToken({
  id,
  valor,
  aoMudar,
  invalido,
  rotulo = 'Token do GitHub',
  placeholder = 'github_pat_…',
  ajuda = 'Token fine-grained só de leitura (Metadata, Pull requests e Commit statuses). Ele fica guardado criptografado e nunca aparece de novo.',
  maxLength = 500,
}: PropsCampoToken) {
  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={id}>
        {rotulo}
      </label>
      <input
        id={id}
        className="controle mono"
        type="password"
        autoComplete="off"
        spellCheck={false}
        maxLength={maxLength}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={invalido ? true : undefined}
        aria-describedby={`${id}-ajuda`}
      />
      <span id={`${id}-ajuda`} className="campo-ajuda">
        {ajuda}
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

type PropsEditor = {
  id: string
  lista: string[]
  aoMudar: (lista: string[]) => void
  /** Mensagem de validação ao adicionar ('' limpa). */
  aoErro: (erro: string) => void
  editavel: boolean
}

/**
 * Lista de repositórios (dono/repo) com o campo de adicionar: remove, valida o formato, aceita a URL do GitHub e
 * respeita o limite. Usada em Configurações e nos Primeiros passos.
 */
export function EditorRepositorios({ id, lista, aoMudar, aoErro, editavel }: PropsEditor) {
  const [novo, setNovo] = useState('')
  const cheio = lista.length >= REPOSITORIOS_MAXIMOS

  function adicionar() {
    const nome = normalizarRepositorio(novo)
    if (!nome) return
    if (!repositorioValido(nome)) return aoErro('Use o formato dono/repo, por exemplo acme/portal.')
    if (lista.some((r) => r.toLowerCase() === nome.toLowerCase())) return aoErro('Esse repositório já está na lista.')
    if (cheio) return aoErro(`Dá pra acompanhar até ${REPOSITORIOS_MAXIMOS} repositórios por workspace.`)
    aoErro('')
    aoMudar([...lista, nome])
    setNovo('')
  }

  return (
    <>
      {lista.length === 0 ? (
        <p className="bloco-vazio">{editavel ? 'Nenhum repositório ainda. Adicione o primeiro aqui embaixo.' : 'Nenhum repositório configurado ainda.'}</p>
      ) : (
        <ul className="lista-cfg" aria-label="Repositórios acompanhados">
          {lista.map((r) => (
            <li key={r}>
              <IconeRepositorio />
              <span className="txt mono">{r}</span>
              {editavel && (
                <button
                  type="button"
                  className="botao botao-fantasma botao-icone botao-p"
                  aria-label={`Tirar ${r} da lista`}
                  onClick={() => aoMudar(lista.filter((x) => x !== r))}
                >
                  <IconeLixo />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editavel && (
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
      )}
    </>
  )
}

/** Lista de repositórios (dono/repo). Sem GitHub conectado, o mesmo formulário pede o token. */
function Repositorios({ config, dono, aoMudar }: PropsGithub) {
  const { api } = useAuth()
  const { avisar } = useAvisos()
  const id = useId()
  const [lista, setLista] = useState(config.repositorios)
  const [token, setToken] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const mudou = lista.join('\n') !== config.repositorios.join('\n')

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
        <EditorRepositorios id={id} lista={lista} aoMudar={setLista} aoErro={setErro} editavel={dono} />
        {dono && (
          <>
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
