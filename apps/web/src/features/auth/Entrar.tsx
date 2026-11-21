import { useId, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAvisos } from '../../ui/avisos.ts'
import { PUBLICAS } from '../../ui/rota.ts'
import { useVarredura } from '../../ui/transicao.ts'
import { LayoutL2 } from './LayoutL2.tsx'

/** Depois de entrar, quem estava numa tela pública (#/criar-conta…) cai no Início. */
function irParaInicioSePublica() {
  const tela = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  if ((PUBLICAS as readonly string[]).includes(tela)) window.history.replaceState(null, '', '#/inicio')
}

export function Entrar({ cliente }: { cliente: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const { avisar } = useAvisos()
  const varrer = useVarredura()
  const id = useId()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    irParaInicioSePublica()
    const { error } = await cliente.auth.signInWithPassword({ email, password: senha })
    setEnviando(false)
    if (error) {
      setErro('E-mail ou senha não batem. Confere e tenta de novo.')
      return
    }
    varrer()
    avisar({ tipo: 'ok', titulo: 'Que bom te ver por aqui!', texto: 'Bora ver o que sobe hoje.' })
  }

  return (
    <LayoutL2>
      <form className="login-form" onSubmit={(e) => void enviar(e)} aria-label="Entrar no portal">
        <div className="login-titulo">
          <h1>Entrar</h1>
          <p className="suave">Bora pro deploy de hoje? Entre para ver o que sobe e o que está em revisão.</p>
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-email`}>
            E-mail
          </label>
          <input
            id={`${id}-email`}
            className="controle"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={erro ? true : undefined}
          />
        </div>
        <div className="campo">
          <div className="campo-cab">
            <label className="campo-rotulo" htmlFor={`${id}-senha`}>
              Senha
            </label>
            <a className="link-p" href="#/esqueci">
              Esqueci a senha
            </a>
          </div>
          <input
            id={`${id}-senha`}
            className="controle"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            aria-invalid={erro ? true : undefined}
          />
        </div>
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
        <button type="submit" className="botao botao-primario botao-g botao-cheio" disabled={enviando}>
          {enviando && <span className="giro" aria-hidden="true" />}
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="login-rodape">
          Primeira vez por aqui? <a href="#/criar-conta">Criar conta</a> · <a href="/demo">Ver a demo</a>
        </p>
      </form>
    </LayoutL2>
  )
}
