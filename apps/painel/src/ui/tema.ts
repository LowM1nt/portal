import { useSyncExternalStore } from 'react'
import { sistemaPrefereClaro } from './preferencias.ts'

export type Tema = 'escuro' | 'claro'

export const CHAVE_TEMA = 'm1nt-tema'

// O armazenamento pode estar bloqueado (aba anônima, cookies desligados): nunca deixa a tela quebrar.
function lerSalvo(): Tema | null {
  try {
    const valor = window.localStorage.getItem(CHAVE_TEMA)
    return valor === 'claro' || valor === 'escuro' ? valor : null
  } catch {
    return null
  }
}

function salvar(tema: Tema) {
  try {
    window.localStorage.setItem(CHAVE_TEMA, tema)
  } catch {
    // sem armazenamento: o tema vale só até recarregar a página
  }
}

/** Escolha salva; sem escolha, segue o sistema; sem preferência, escuro. */
export function temaInicial(): Tema {
  return lerSalvo() ?? (sistemaPrefereClaro() ? 'claro' : 'escuro')
}

export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = tema === 'claro' ? 'light' : 'dark'
}

let atual: Tema | null = null
const ouvintes = new Set<() => void>()

function ler(): Tema {
  if (atual === null) atual = temaInicial()
  return atual
}

export function definirTema(tema: Tema) {
  atual = tema
  aplicarTema(tema)
  salvar(tema)
  ouvintes.forEach((avisar) => avisar())
}

export function alternarTema() {
  definirTema(ler() === 'claro' ? 'escuro' : 'claro')
}

/** Só para testes: esquece o tema em memória (a próxima leitura volta a olhar o armazenamento). */
export function esquecerTema() {
  atual = null
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}

export function useTema(): Tema {
  return useSyncExternalStore(assinar, ler, () => 'escuro')
}
