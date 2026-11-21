import { useId, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAvisos } from '../../ui/avisos.ts'
import { ForcaSenha } from './ForcaSenha.tsx'
import { LayoutL2 } from './LayoutL2.tsx'
import { FORCA_MINIMA, MENSAGEM_FALHA, forcaSenha, tipoDeFalha } from './senha.ts'

/** Volta do link "Esqueci a senha": quem chegou pelo e-mail escolhe a senha nova. */
export function NovaSenha({ cliente, aoConcluir }: { cliente: SupabaseClient; aoConcluir: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const { avisar } = useAvisos()
  const id = useId()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (forcaSenha(senha) < FORCA_MINIMA) return setErro('Bora uma senha mais forte: 8+ caracteres com letras, números e um símbolo.')
    setErro('')
    setEnviando(true)
    try {
      const { error } = await cliente.auth.updateUser({ password: senha })
      const falha = tipoDeFalha(error)
      if (falha === 'outra') return setErro('Não deu pra salvar a senha. O link pode ter expirado: pede outro em "Esqueci a senha".')
      if (falha) return setErro(MENSAGEM_FALHA[falha])
      window.history.replaceState(null, '', '#/inicio')
      avisar({ tipo: 'ok', titulo: 'Senha nova salva!', texto: 'Pronto, é ela que vale no próximo login.' })
      aoConcluir()
    } catch {
      setErro(MENSAGEM_FALHA.conexao)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <LayoutL2>
      <form className="login-form" onSubmit={(e) => void enviar(e)} noValidate aria-label="Criar senha nova">
        <div className="login-titulo">
          <h1>Crie uma senha nova</h1>
          <p className="suave">Escolhe uma senha forte. Ela passa a valer na hora.</p>
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-senha`}>
            Senha nova
          </label>
          <input
            id={`${id}-senha`}
            className="controle"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            aria-invalid={erro ? true : undefined}
            aria-describedby={`${id}-forca`}
          />
          <ForcaSenha senha={senha} id={`${id}-forca`} />
        </div>
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
        <button type="submit" className="botao botao-primario botao-g botao-cheio" disabled={enviando}>
          {enviando && <span className="giro" aria-hidden="true" />}
          {enviando ? 'Salvando…' : 'Salvar senha'}
        </button>
      </form>
    </LayoutL2>
  )
}
