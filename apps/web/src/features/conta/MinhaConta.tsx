import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { PAPEIS, json, type Papel } from '../config/api.ts'
import { useAvisos } from '../../ui/avisos.ts'
import { IconeGithub, IconeLua, IconeMonitor, IconeRelogio, IconeSair, IconeSol } from '../../ui/icones.tsx'
import { definirPreferenciaTema, usePreferenciaTema, type PreferenciaTema } from '../../ui/tema.ts'
import { erroDoServidor } from '../../ui/useCarregar.ts'
import { DuasEtapas } from './DuasEtapas.tsx'
import { loginGithubValido } from './github.ts'
import './conta.css'

const TEMAS: { id: PreferenciaTema; nome: string; icone: ReactNode }[] = [
  { id: 'escuro', nome: 'Escuro', icone: <IconeLua /> },
  { id: 'claro', nome: 'Claro', icone: <IconeSol /> },
  { id: 'sistema', nome: 'Sistema', icone: <IconeMonitor /> },
]

/** Minha conta: perfil, login do GitHub, tema, verificação em duas etapas, sessões e sair. */
export function MinhaConta({ aoSair }: { aoSair: () => void }) {
  const { email, workspaceAtivo } = useAuth()
  const papel = PAPEIS[workspaceAtivo?.papel as Papel]
  const inicial = (email?.trim()[0] ?? '?').toUpperCase()
  return (
    <div className="tela-conta">
      <section className="cartao perfil" aria-label="Perfil">
        <span className="avatar avatar-xg" aria-hidden="true">
          {inicial}
        </span>
        <div className="perfil-txt">
          <b>{email ?? 'Sem e-mail'}</b>
          <span className="suave">
            {workspaceAtivo ? `${papel?.nome ?? workspaceAtivo.papel} no workspace ${workspaceAtivo.nome}` : 'Sem workspace ativo'}
          </span>
        </div>
      </section>
      <LoginGithub />
      <Aparencia />
      <section className="cartao bloco" aria-labelledby="conta-seguranca">
        <div className="bloco-cab">
          <h2 id="conta-seguranca">Segurança</h2>
        </div>
        <ul className="lista-cfg">
          <DuasEtapas />
          <Sessoes />
        </ul>
      </section>
      <div>
        <button type="button" className="botao botao-fantasma" onClick={aoSair}>
          <IconeSair />
          Sair da conta
        </button>
      </div>
    </div>
  )
}

function LoginGithub() {
  const { api, githubLogin, definirGithubLogin } = useAuth()
  const { avisar } = useAvisos()
  const id = useId()
  const [valor, setValor] = useState(githubLogin ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const limpo = valor.trim().replace(/^@/, '')
  const mudou = limpo !== (githubLogin ?? '')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (limpo && !loginGithubValido(limpo)) return setErro('Use só letras, números e hífens (até 39), como em github.com/seu-usuario.')
    setErro('')
    setSalvando(true)
    try {
      const r = await api('/api/me/github', { method: 'PUT', ...json({ login: limpo }) })
      if (r.ok) {
        const corpo = (await r.json()) as { githubLogin: string | null }
        definirGithubLogin(corpo.githubLogin ?? null)
        setValor(corpo.githubLogin ?? '')
        avisar(
          corpo.githubLogin
            ? { tipo: 'ok', titulo: 'Login do GitHub salvo!', texto: 'Agora "Esperando você" mostra só as PRs que pedem a sua revisão.' }
            : { tipo: 'ok', titulo: 'Login do GitHub removido', texto: 'A fila volta a mostrar as PRs do time todo.' },
        )
        return
      }
      if (r.status !== 401) setErro((await erroDoServidor(r)) ?? 'Não deu pra salvar. Tenta de novo em instantes.')
    } catch {
      setErro('Não deu pra salvar. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="cartao bloco" aria-labelledby={`${id}-t`}>
      <div className="bloco-cab">
        <h2 id={`${id}-t`}>GitHub</h2>
        {githubLogin ? <span className="selo selo-ok">Configurado</span> : <span className="selo selo-neutro">Não configurado</span>}
      </div>
      <form className="config-form" onSubmit={(e) => void salvar(e)} noValidate aria-label="Login do GitHub">
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-login`}>
            Seu usuário do GitHub
          </label>
          <div className="linha-campo">
            <span className="controle-com-icone">
              <IconeGithub />
              <input
                id={`${id}-login`}
                className="controle mono"
                placeholder="seu-usuario"
                autoComplete="off"
                spellCheck={false}
                maxLength={40}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                aria-invalid={erro ? true : undefined}
                aria-describedby={`${id}-ajuda`}
              />
            </span>
            <button type="submit" className="botao botao-primario" disabled={salvando || !mudou}>
              {salvando && <span className="giro" aria-hidden="true" />}
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
          <span id={`${id}-ajuda`} className="campo-ajuda">
            É com ele que o Início e a fila de revisão mostram o que está "Esperando você". Deixe vazio para ver as PRs do time todo.
          </span>
        </div>
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
      </form>
    </section>
  )
}

function Aparencia() {
  const preferencia = usePreferenciaTema()
  return (
    <section className="cartao bloco" aria-labelledby="conta-aparencia">
      <div className="bloco-cab">
        <h2 id="conta-aparencia">Aparência</h2>
      </div>
      <ul className="lista-cfg">
        <li className="linha-cfg">
          <span className="txt">
            <b>Tema</b>
            <span>O escuro é o padrão. A escolha fica salva neste aparelho.</span>
          </span>
          <div className="segmento" role="radiogroup" aria-label="Tema">
            {TEMAS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                className="segmento-op"
                aria-checked={preferencia === t.id}
                onClick={() => definirPreferenciaTema(t.id)}
              >
                {t.icone}
                {t.nome}
              </button>
            ))}
          </div>
        </li>
      </ul>
    </section>
  )
}

function Sessoes() {
  const { cliente } = useAuth()
  const { avisar } = useAvisos()
  const [saindo, setSaindo] = useState(false)

  async function sairDasOutras() {
    setSaindo(true)
    try {
      const { error } = await cliente.auth.signOut({ scope: 'others' })
      if (error) throw error
      avisar({ tipo: 'ok', titulo: 'Outras sessões encerradas', texto: 'Só este aparelho continua conectado.' })
    } catch {
      avisar({ tipo: 'erro', titulo: 'Não deu pra encerrar as outras sessões', texto: 'Sem conexão? Tenta de novo em instantes.' })
    } finally {
      setSaindo(false)
    }
  }

  return (
    <li className="linha-cfg">
      <span className="linha-cfg-icone" aria-hidden="true">
        <IconeRelogio />
      </span>
      <span className="txt">
        <b>Sessões</b>
        <span>Entrou em outro computador ou celular e esqueceu de sair? Encerre tudo menos este aparelho.</span>
      </span>
      <button type="button" className="botao botao-secundario botao-p" disabled={saindo} onClick={() => void sairDasOutras()}>
        {saindo && <span className="giro" aria-hidden="true" />}
        {saindo ? 'Encerrando…' : 'Sair das outras sessões'}
      </button>
    </li>
  )
}
