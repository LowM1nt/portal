import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth, type Workspace } from '../auth/AuthProvider.tsx'
import { lerConfigGithub, PAPEIS, REPOSITORIOS_MAXIMOS, json, salvarGithub, type ConfigGithub, type ConvitePendente } from '../config/api.ts'
import { CampoToken, EditorRepositorios } from '../config/Integracoes.tsx'
import { Convidar } from '../config/Time.tsx'
import { useAvisos } from '../../ui/avisos.ts'
import { Carregando, EstadoErro } from '../../ui/Estados.tsx'
import { IconeCheck, IconeEnvelope, IconeGithub, IconeNovo } from '../../ui/icones.tsx'
import { Logo } from '../../ui/Marca.tsx'
import { erroDoServidor, useCarregar } from '../../ui/useCarregar.ts'
import { NOME_MAXIMO, NOME_PADRAO, PASSOS, guardarEscolha, hrefPasso, type Escolha } from './primeirosPassos.ts'
import './primeiros-passos.css'

type Ir = (href: string, opcoes?: { substituir?: boolean }) => void

/** Primeiros passos: Workspace → GitHub → Repositórios → Time. Tela cheia, sem a casca; dá pra sair a qualquer hora. */
export function PrimeirosPassos({ passo, ir }: { passo: number; ir: Ir }) {
  const { estado, usuarioId, workspaceAtivo, api, tentarDeNovo } = useAuth()
  const { avisar } = useAvisos()
  const dono = workspaceAtivo?.papel === 'dono'
  const carregar = useCallback(() => lerConfigGithub(api), [api])
  const github = useCarregar(carregar, estado === 'pronto' && dono && workspaceAtivo ? workspaceAtivo.id : null)
  // Convites criados aqui (só e-mail e papel; o link some ao fechar o modal).
  const [convidados, setConvidados] = useState<ConvitePendente[]>([])

  const irPasso = (n: number) => ir(hrefPasso(n))
  const atualizarGithub = (c: ConfigGithub) => github.definir(() => c)

  function sair(escolha: Escolha) {
    if (usuarioId) guardarEscolha(usuarioId, escolha)
    if (escolha === 'concluido') {
      avisar({ tipo: 'ok', titulo: 'Tudo pronto!', texto: 'Seu workspace tá no jeito. Bora pro primeiro deploy?' })
    } else {
      avisar({ tipo: 'info', titulo: 'Beleza, fica pra depois', texto: 'Dá pra retomar quando quiser em Configurações.' })
    }
    ir('#/inicio')
  }

  let corpo: ReactNode
  const precisaGithub = passo > 1 && dono
  if (estado === 'carregando' || (precisaGithub && github.estado === 'carregando')) {
    corpo = (
      <Carregando className="onb-carregando">
        <span className="osso osso-titulo" />
        <span className="osso osso-campo" />
        <span className="osso osso-campo" />
      </Carregando>
    )
  } else if (estado === 'erro') {
    corpo = <EstadoErro titulo="Ops, não deu pra carregar seus dados." texto="Seus dados estão seguros. Tenta de novo?" aoTentar={tentarDeNovo} />
  } else if (precisaGithub && (github.estado === 'erro' || !github.dados)) {
    corpo = <EstadoErro titulo="Ops, não deu pra carregar o GitHub do workspace." texto="Seus dados estão seguros. Tenta de novo?" aoTentar={github.recarregar} />
  } else if (passo > 1 && !dono) {
    corpo = (
      <>
        <Titulo titulo="Esse passo é com quem é dono" texto="Você não é dono do workspace selecionado. Volta pro primeiro passo e cria o seu." />
        <Acoes>
          <button type="button" className="botao botao-primario" onClick={() => irPasso(1)}>
            Voltar pro workspace
          </button>
        </Acoes>
      </>
    )
  } else if (passo === 1) {
    corpo = <PassoWorkspace aoContinuar={() => irPasso(2)} />
  } else if (passo === 2) {
    corpo = <PassoGithub config={github.dados as ConfigGithub} aoSalvo={atualizarGithub} aoVoltar={() => irPasso(1)} aoContinuar={() => irPasso(3)} />
  } else if (passo === 3) {
    const config = github.dados as ConfigGithub
    corpo = (
      <PassoRepositorios
        key={config.repositorios.join(',')}
        config={config}
        aoSalvo={atualizarGithub}
        aoVoltar={() => irPasso(2)}
        aoContinuar={() => irPasso(4)}
      />
    )
  } else {
    corpo = (
      <PassoTime
        convidados={convidados}
        aoConvidar={(c) => setConvidados((l) => [...l, c])}
        aoVoltar={() => irPasso(3)}
        aoConcluir={() => sair('concluido')}
      />
    )
  }

  return (
    <main className="onb">
      <Logo className="onb-logo" />
      <Indicador passo={passo} />
      <div key={passo} className="cartao onb-cartao">
        {corpo}
      </div>
      <button type="button" className="botao botao-fantasma" onClick={() => sair('pulado')}>
        Fazer depois
      </button>
    </main>
  )
}

function Indicador({ passo }: { passo: number }) {
  return (
    <ol className="passos" aria-label={`Passo ${passo} de ${PASSOS.length}`}>
      {PASSOS.map((nome, i) => {
        const n = i + 1
        const feito = n < passo
        return (
          <li key={nome} className={`passo${n === passo ? ' passo-atual' : ''}${feito ? ' passo-feito' : ''}`} aria-current={n === passo ? 'step' : undefined}>
            <i aria-hidden="true">{feito ? <IconeCheck /> : n}</i>
            <span className="passo-nome">
              {nome}
              {feito && <span className="sr"> (feito)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Titulo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="onb-titulo">
      <h1>{titulo}</h1>
      <p className="suave">{texto}</p>
    </div>
  )
}

function Acoes({ children, voltar }: { children: ReactNode; voltar?: () => void }) {
  return (
    <div className="onb-acoes">
      {voltar && (
        <button type="button" className="botao botao-fantasma onb-voltar" onClick={voltar}>
          Voltar
        </button>
      )}
      {children}
    </div>
  )
}

function Erro({ erro }: { erro: string }) {
  return erro ? (
    <p role="alert" className="campo-erro">
      {erro}
    </p>
  ) : null
}

/** 1. Nome do workspace. A API não renomeia: um nome diferente do atual cria um workspace novo e seleciona ele. */
function PassoWorkspace({ aoContinuar }: { aoContinuar: () => void }) {
  const { api, workspaceAtivo, adicionarWorkspace } = useAuth()
  const { avisar } = useAvisos()
  const id = useId()
  const atual = workspaceAtivo?.papel === 'dono' ? workspaceAtivo.nome : ''
  const [nome, setNome] = useState(atual === NOME_PADRAO ? '' : atual)
  const [erro, setErro] = useState('')
  const [criando, setCriando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const limpo = nome.trim()
    if (!limpo) return setErro('Dá um nome pro workspace, tipo o nome do time ou da empresa.')
    if (limpo.length > NOME_MAXIMO) return setErro(`O nome pode ter até ${NOME_MAXIMO} caracteres.`)
    setErro('')
    if (limpo === atual) return aoContinuar()
    setCriando(true)
    try {
      const r = await api('/api/workspaces', { method: 'POST', ...json({ nome: limpo }) })
      if (r.ok) {
        const criado = (await r.json()) as Workspace
        adicionarWorkspace(criado)
        avisar({ tipo: 'ok', titulo: 'Workspace criado!', texto: `${criado.nome} já está selecionado.` })
        return aoContinuar()
      }
      if (r.status !== 401) setErro((await erroDoServidor(r)) ?? 'Não deu pra criar o workspace. Tenta de novo em instantes.')
    } catch {
      setErro('Não deu pra criar o workspace. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setCriando(false)
    }
  }

  return (
    <form className="onb-form" onSubmit={(e) => void enviar(e)} noValidate aria-label="Workspace do time">
      <Titulo titulo="Dá um nome pro seu workspace" texto="É o espaço do seu time: deploys, revisões e bugs ficam todos aqui." />
      <div className="campo">
        <label className="campo-rotulo" htmlFor={`${id}-nome`}>
          Nome do workspace
        </label>
        <input
          id={`${id}-nome`}
          className="controle"
          autoComplete="organization"
          placeholder="Ex.: Acme"
          maxLength={NOME_MAXIMO}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={`${id}-ajuda`}
        />
        <span id={`${id}-ajuda`} className="campo-ajuda">
          {atual && atual !== NOME_PADRAO
            ? 'Trocou o nome? A gente cria um workspace novo com ele e já deixa selecionado.'
            : 'A gente cria o workspace com esse nome e já seleciona. O pessoal continua lá.'}
        </span>
      </div>
      <Erro erro={erro} />
      <Acoes>
        <button type="submit" className="botao botao-primario" disabled={criando}>
          {criando && <span className="giro" aria-hidden="true" />}
          {criando ? 'Criando…' : 'Continuar'}
        </button>
      </Acoes>
    </form>
  )
}

type PropsGithub = { config: ConfigGithub; aoSalvo: (c: ConfigGithub) => void; aoVoltar: () => void; aoContinuar: () => void }

/** 2. Token do GitHub (só leitura). O token vai no PUT e sai da memória da tela logo depois. */
function PassoGithub({ config, aoSalvo, aoVoltar, aoContinuar }: PropsGithub) {
  const { api } = useAuth()
  const { avisar } = useAvisos()
  const id = useId()
  const [token, setToken] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!token.trim()) return setErro('Cola o token do GitHub pra conectar (ou pula esse passo).')
    setErro('')
    setSalvando(true)
    try {
      const r = await salvarGithub(api, { token: token.trim(), repositorios: config.repositorios })
      if (r.ok) {
        setToken('')
        aoSalvo((await r.json()) as ConfigGithub)
        avisar({ tipo: 'ok', titulo: 'GitHub conectado!', texto: 'Agora escolhe os repositórios do time.' })
        return aoContinuar()
      }
      if (r.status !== 401) setErro((await erroDoServidor(r)) ?? 'Não deu pra salvar o token. Tenta de novo em instantes.')
    } catch {
      setErro('Não deu pra salvar. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setSalvando(false)
    }
  }

  if (config.configurado) {
    return (
      <div className="onb-form">
        <Titulo titulo="GitHub conectado" texto="A gente lê PRs e status de CI. Só leitura: nada muda nos seus repositórios." />
        <div className="lista-cfg onb-caixa">
          <div className="linha-cfg">
            <span className="integ-logo integ-logo-p" aria-hidden="true">
              <IconeGithub />
            </span>
            <span className="txt">
              <b>GitHub</b>
              <span>
                Token final <span className="mono">••••{config.finalToken}</span>
              </span>
            </span>
            <span className="selo selo-ok">Conectado</span>
          </div>
        </div>
        <Acoes voltar={aoVoltar}>
          <button type="button" className="botao botao-primario" onClick={aoContinuar}>
            Continuar
          </button>
        </Acoes>
      </div>
    )
  }

  return (
    <form className="onb-form" onSubmit={(e) => void enviar(e)} noValidate aria-label="Conectar o GitHub">
      <Titulo titulo="Conecta o GitHub" texto="A gente lê PRs e status de CI. Só leitura: nada muda nos seus repositórios." />
      <div className="onb-dica">
        <b>Como gerar o token</b>
        <ol>
          <li>
            Abre{' '}
            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">
              github.com/settings/tokens
            </a>{' '}
            (abre numa aba nova).
          </li>
          <li>Clica em “Generate new token” e escolhe o fine-grained.</li>
          <li>Escolhe os repositórios do time e dá só leitura em Metadata, Pull requests e Commit statuses.</li>
          <li>Gera, copia e cola aqui embaixo.</li>
        </ol>
      </div>
      <CampoToken id={`${id}-token`} valor={token} aoMudar={setToken} invalido={Boolean(erro)} />
      <Erro erro={erro} />
      <Acoes voltar={aoVoltar}>
        <button type="button" className="botao botao-fantasma" onClick={aoContinuar}>
          Pular
        </button>
        <button type="submit" className="botao botao-primario" disabled={salvando}>
          {salvando ? <span className="giro" aria-hidden="true" /> : <IconeGithub />}
          {salvando ? 'Conectando…' : 'Conectar GitHub'}
        </button>
      </Acoes>
    </form>
  )
}

/** 3. Repositórios (dono/repo, até 50), salvos no mesmo PUT do GitHub (sem mandar token de novo). */
function PassoRepositorios({ config, aoSalvo, aoVoltar, aoContinuar }: PropsGithub) {
  const { api } = useAuth()
  const { avisar } = useAvisos()
  const id = useId()
  const [lista, setLista] = useState(config.repositorios)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const mudou = lista.join('\n') !== config.repositorios.join('\n')

  if (!config.configurado) {
    return (
      <div className="onb-form">
        <Titulo titulo="Quais repositórios entram?" texto="Pra escolher os repositórios, conecta o GitHub primeiro. Ou pula e faz depois em Configurações." />
        <Acoes voltar={aoVoltar}>
          <button type="button" className="botao botao-fantasma" onClick={aoContinuar}>
            Pular
          </button>
          <button type="button" className="botao botao-primario" onClick={aoVoltar}>
            <IconeGithub />
            Conectar GitHub
          </button>
        </Acoes>
      </div>
    )
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!mudou) return aoContinuar()
    setErro('')
    setSalvando(true)
    try {
      const r = await salvarGithub(api, { repositorios: lista })
      if (r.ok) {
        aoSalvo((await r.json()) as ConfigGithub)
        avisar({ tipo: 'ok', titulo: 'Repositórios salvos!', texto: 'As PRs deles chegam em até 10 minutos.' })
        return aoContinuar()
      }
      if (r.status !== 401) setErro((await erroDoServidor(r)) ?? 'Não deu pra salvar. Tenta de novo em instantes.')
    } catch {
      setErro('Não deu pra salvar. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="onb-form" onSubmit={(e) => void enviar(e)} noValidate aria-label="Repositórios do GitHub">
      <div className="onb-titulo-linha">
        <Titulo titulo="Quais repositórios entram?" texto="Os que fazem parte das entregas do time. Cola dono/repo ou a URL do GitHub." />
        <span className="suave contagem">
          {lista.length} de {REPOSITORIOS_MAXIMOS}
        </span>
      </div>
      <div className="onb-repos">
        <EditorRepositorios id={id} lista={lista} aoMudar={setLista} aoErro={setErro} editavel />
      </div>
      <Erro erro={erro} />
      <Acoes voltar={aoVoltar}>
        {mudou && (
          <button type="button" className="botao botao-fantasma" onClick={aoContinuar}>
            Pular
          </button>
        )}
        <button type="submit" className="botao botao-primario" disabled={salvando}>
          {salvando && <span className="giro" aria-hidden="true" />}
          {salvando ? 'Salvando…' : mudou ? 'Salvar e continuar' : 'Continuar'}
        </button>
      </Acoes>
    </form>
  )
}

type PropsTime = { convidados: ConvitePendente[]; aoConvidar: (c: ConvitePendente) => void; aoVoltar: () => void; aoConcluir: () => void }

/** 4. Convites: o mesmo modal de Configurações (link mostrado uma vez, com copiar). */
function PassoTime({ convidados, aoConvidar, aoVoltar, aoConcluir }: PropsTime) {
  const [convidando, setConvidando] = useState(false)
  return (
    <div className="onb-form">
      <Titulo titulo="Chama o time" texto="Cada convite gera um link que vale 7 dias. Pode pular e convidar depois em Configurações." />
      {convidados.length > 0 && (
        <ul className="lista-cfg onb-caixa" aria-label="Convites criados">
          {convidados.map((c) => (
            <li key={c.id}>
              <span className="integ-logo integ-logo-p" aria-hidden="true">
                <IconeEnvelope />
              </span>
              <span className="txt">
                <b>{c.email}</b>
                <span>{(PAPEIS[c.papel] ?? PAPEIS.membro).nome} · convite criado</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="botao botao-secundario onb-convidar" onClick={() => setConvidando(true)}>
        <IconeNovo />
        {convidados.length ? 'Convidar mais alguém' : 'Convidar alguém'}
      </button>
      <Acoes voltar={aoVoltar}>
        <button type="button" className="botao botao-primario" onClick={aoConcluir}>
          {convidados.length ? 'Concluir' : 'Pular e concluir'}
        </button>
      </Acoes>
      {convidando && <Convidar aoFechar={() => setConvidando(false)} aoCriado={aoConvidar} />}
    </div>
  )
}
