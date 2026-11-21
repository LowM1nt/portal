import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { IconeBusca } from './icones.tsx'

export type Comando = {
  id: string
  grupo: 'Ações' | 'Ir para'
  nome: string
  icone: ReactNode
  executar: () => void
}

const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Busca rápida (Ctrl+K): setas navegam, Enter executa, Esc fecha; o foco fica preso no campo. */
export function Paleta({ comandos, aoFechar }: { comandos: Comando[]; aoFechar: () => void }) {
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(0)
  const campo = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    campo.current?.focus()
  }, [])

  const termo = normalizar(busca.trim())
  const itens = comandos.filter((c) => normalizar(c.nome).includes(termo))
  const atual = Math.min(selecionado, Math.max(itens.length - 1, 0))
  const grupos = [...new Set(itens.map((c) => c.grupo))]

  function executar(comando: Comando | undefined) {
    if (!comando) return
    aoFechar()
    comando.executar()
  }

  function teclado(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      aoFechar()
    } else if (e.key === 'ArrowDown' && itens.length) {
      e.preventDefault()
      setSelecionado((atual + 1) % itens.length)
    } else if (e.key === 'ArrowUp' && itens.length) {
      e.preventDefault()
      setSelecionado((atual - 1 + itens.length) % itens.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      executar(itens[atual])
    } else if (e.key === 'Tab') {
      // Foco preso: o único elemento focável do diálogo é o campo de busca.
      e.preventDefault()
      campo.current?.focus()
    }
  }

  const idOpcao = (c: Comando) => `${id}-${c.id}`

  return (
    <>
      <div className="veu" onClick={aoFechar} aria-hidden="true" />
      <div className="paleta" role="dialog" aria-modal="true" aria-label="Busca rápida" onKeyDown={teclado}>
        <label className="paleta-busca">
          <IconeBusca />
          <span className="sr">Buscar uma tela ou ação</span>
          <input
            ref={campo}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setSelecionado(0)
            }}
            placeholder="Busque uma tela ou ação…"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-lista`}
            aria-activedescendant={itens[atual] ? idOpcao(itens[atual]) : undefined}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="paleta-lista" id={`${id}-lista`} role="listbox" aria-label="Resultados">
          {itens.length === 0 && (
            <p className="paleta-nada">
              <b>Nada encontrado</b>
              <span>Tenta outra palavra.</span>
            </p>
          )}
          {grupos.map((grupo) => (
            <div key={grupo} role="group" aria-label={grupo}>
              <small aria-hidden="true">{grupo}</small>
              {itens
                .filter((c) => c.grupo === grupo)
                .map((c) => {
                  const ativo = itens[atual] === c
                  return (
                    <div
                      key={c.id}
                      id={idOpcao(c)}
                      role="option"
                      aria-selected={ativo}
                      className={`paleta-op${ativo ? ' paleta-op-ativa' : ''}`}
                      onMouseMove={() => setSelecionado(itens.indexOf(c))}
                      onClick={() => executar(c)}
                    >
                      {c.icone}
                      <span>{c.nome}</span>
                    </div>
                  )
                })}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
