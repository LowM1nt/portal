import { useId, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAvisos } from '../../ui/avisos.ts'
import { limparCodigo } from '../conta/mfa.ts'
import { LayoutL2 } from './LayoutL2.tsx'

/**
 * Login com verificação em duas etapas: depois da senha, pede o código do app autenticador.
 * O Supabase troca a sessão por uma de nível aal2 quando o código confere.
 */
export function VerificarMfa({
  cliente,
  aoSair,
  aoVerificado,
}: {
  cliente: SupabaseClient
  aoSair: () => void
  /** Código conferido (sessão aal2). */
  aoVerificado?: () => void
}) {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const { avisar } = useAvisos()
  const id = useId()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const limpo = limparCodigo(codigo)
    if (!/^\d{6}$/.test(limpo)) return setErro('O código tem 6 números. Confere no app autenticador.')
    setErro('')
    setEnviando(true)
    try {
      const { data, error } = await cliente.auth.mfa.listFactors()
      const fator = data?.totp?.[0]
      if (error || !fator) return setErro('Não achamos sua verificação em duas etapas. Sai e entra de novo, por favor.')
      const r = await cliente.auth.mfa.challengeAndVerify({ factorId: fator.id, code: limpo })
      if (r.error) return setErro('Código não confere ou expirou. Espera o próximo no app e tenta de novo.')
      aoVerificado?.()
      avisar({ tipo: 'ok', titulo: 'Tudo certo!', texto: 'Verificação em duas etapas confirmada.' })
    } catch {
      setErro('Não deu pra conferir o código. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <LayoutL2>
      <form className="login-form" onSubmit={(e) => void enviar(e)} noValidate aria-label="Verificação em duas etapas">
        <div className="login-titulo">
          <h1>Só mais um passo</h1>
          <p className="suave">Abre o app autenticador e digita o código de 6 números do Releasy.</p>
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-codigo`}>
            Código
          </label>
          <input
            id={`${id}-codigo`}
            className="controle"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={9}
            autoFocus
            placeholder="123456"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
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
          {enviando ? 'Conferindo…' : 'Confirmar código'}
        </button>
        <p className="login-rodape">
          Não é você ou perdeu o aparelho?{' '}
          <button type="button" className="link-botao" onClick={aoSair}>
            Sair
          </button>
        </p>
      </form>
    </LayoutL2>
  )
}
