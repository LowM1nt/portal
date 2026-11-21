import { createContext, useContext } from 'react'

/** Dispara a varredura de luz da entrada (não faz nada com "reduzir movimento" ou sem provedor). */
export const TransicaoContexto = createContext<() => void>(() => undefined)

export function useVarredura(): () => void {
  return useContext(TransicaoContexto)
}

/** Duração da varredura; depois disso o véu de luz sai do DOM. */
export const DURACAO_VARREDURA = 1100
