import { useId, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ConfiraSeuEmail } from './CriarConta.tsx'
import { LayoutL2 } from './LayoutL2.tsx'
import { MENSAGEM_FALHA, emailValido, tipoDeFalha } from './senha.ts'

/** "Esqueci a senha": manda o link e responde sempre igual, exista a conta ou não. */
export function Esqueci({ cliente }: { cliente: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const id = useId()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const m = email.trim()
    if (!emailValido(m)) return setErro('Esse e-mail parece incompleto. Confere pra gente?')
    setErro('')
    setEnviando(true)
    try {
      const { error } = await cliente.auth.resetPasswordForEmail(m, { redirectTo: `${window.location.origin}/` })
      const falha = tipoDeFalha(error)
      if (falha === 'conexao' || falha === 'limite') return setErro(MENSAGEM_FALHA[falha])
      setEnviado(true)
    } catch {
      setErro(MENSAGEM_FALHA.conexao)
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <LayoutL2>
        <ConfiraSeuEmail texto="Se existir uma conta com esse endereço, mandamos um link pra criar uma senha nova. Olha o spam também." />
      </LayoutL2>
    )
  }

  return (
    <LayoutL2>
      <form className="login-form" onSubmit={(e) => void enviar(e)} noValidate aria-label="Esqueci a senha">
        <div className="login-titulo">
          <h1>Esqueceu a senha?</h1>
          <p className="suave">Relaxa, acontece. Manda seu e-mail que a gente te envia um link.</p>
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {enviando ? 'Enviando…' : 'Enviar link'}
        </button>
        <p className="login-rodape">
          <a href="#/entrar">Voltar para o login</a>
        </p>
      </form>
    </LayoutL2>
  )
}
