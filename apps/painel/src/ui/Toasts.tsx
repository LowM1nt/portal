import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AvisosContexto, duracaoToast, type Aviso } from './avisos.ts'
import { IconeAlerta, IconeCheck, IconeInfo, IconeX } from './icones.tsx'

type Toast = Aviso & { id: number }

const MAXIMO = 3

const ICONES = { ok: IconeCheck, erro: IconeAlerta, info: IconeInfo }

/** Toasts no canto superior direito. Erro não some sozinho; os outros somem em 5 s (8 s com "reduzir movimento"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([])
  const proximo = useRef(0)
  const relogios = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const fechar = useCallback((id: number) => {
    const relogio = relogios.current.get(id)
    if (relogio) clearTimeout(relogio)
    relogios.current.delete(id)
    setLista((atual) => atual.filter((t) => t.id !== id))
  }, [])

  const avisar = useCallback(
    (aviso: Aviso) => {
      proximo.current += 1
      const id = proximo.current
      setLista((atual) => [{ ...aviso, id }, ...atual].slice(0, MAXIMO))
      if (aviso.tipo !== 'erro') relogios.current.set(id, setTimeout(() => fechar(id), duracaoToast()))
      return id
    },
    [fechar],
  )

  useEffect(() => {
    const ativos = relogios.current
    return () => ativos.forEach((relogio) => clearTimeout(relogio))
  }, [])

  const valor = useMemo(() => ({ avisar, fechar }), [avisar, fechar])

  return (
    <AvisosContexto.Provider value={valor}>
      {children}
      <section className="toasts" aria-label="Avisos">
        {lista.map((t) => {
          const Icone = ICONES[t.tipo]
          return (
            // status/alert já são regiões vivas: o leitor de tela anuncia cada aviso uma vez
            <div key={t.id} className={`toast toast-${t.tipo}`} role={t.tipo === 'erro' ? 'alert' : 'status'} data-testid="toast">
              <span className="toast-icone">
                <Icone />
              </span>
              <div className="toast-texto">
                <b>{t.titulo}</b>
                {t.texto && <span>{t.texto}</span>}
              </div>
              <button type="button" className="botao-fechar" aria-label="Fechar aviso" onClick={() => fechar(t.id)}>
                <IconeX />
              </button>
              {t.tipo !== 'erro' && <i className="toast-tempo" aria-hidden="true" />}
            </div>
          )
        })}
      </section>
    </AvisosContexto.Provider>
  )
}
