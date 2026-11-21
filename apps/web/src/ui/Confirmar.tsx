import { useState, type ReactNode } from 'react'
import { IconeAlerta } from './icones.tsx'
import { Modal } from './Sobreposicao.tsx'

type Props = {
  titulo: string
  texto: string
  /** Verbo da ação ("Remover") e o gerúndio enquanto roda ("Removendo…"). */
  acao: string
  executando: string
  /** Devolve uma mensagem de erro para mostrar no próprio modal, ou nada se deu certo (aí o modal fecha). */
  aoConfirmar: () => Promise<string | null | void>
  aoFechar: () => void
  children?: ReactNode
}

/** Confirmação de ação perigosa: modal com ícone, "Cancelar" fantasma e a ação em vermelho. */
export function Confirmar({ titulo, texto, acao, executando, aoConfirmar, aoFechar, children }: Props) {
  const [rodando, setRodando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    setRodando(true)
    setErro('')
    try {
      const falha = await aoConfirmar()
      if (falha) setErro(falha)
      else aoFechar()
    } catch {
      setErro('Não deu certo. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setRodando(false)
    }
  }

  return (
    <Modal titulo={titulo} descricao={texto} aoFechar={aoFechar} icone={<IconeAlerta />}>
      <div className="form-sobre">
        {children}
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
        <div className="acoes-sobre">
          <button type="button" className="botao botao-fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao botao-perigo" disabled={rodando} onClick={() => void confirmar()}>
            {rodando && <span className="giro" aria-hidden="true" />}
            {rodando ? executando : acao}
          </button>
        </div>
      </div>
    </Modal>
  )
}
