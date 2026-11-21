import { useSyncExternalStore } from 'react'
import { sistemaPrefereClaro } from './preferencias.ts'

export type Tema = 'escuro' | 'claro'

/** O que a pessoa escolheu: um tema fixo ou seguir o sistema. */
export type PreferenciaTema = Tema | 'sistema'

export const CHAVE_TEMA = 'releasy-tema'

// O armazenamento pode estar bloqueado (aba anônima, cookies desligados): nunca deixa a tela quebrar.
function lerSalvo(): PreferenciaTema | null {
  try {
    const valor = window.localStorage.getItem(CHAVE_TEMA)
    return valor === 'claro' || valor === 'escuro' || valor === 'sistema' ? valor : null
  } catch {
    return null
  }
}

function salvar(preferencia: PreferenciaTema) {
  try {
    window.localStorage.setItem(CHAVE_TEMA, preferencia)
  } catch {
    // sem armazenamento: o tema vale só até recarregar a página
  }
}

const resolver = (preferencia: PreferenciaTema): Tema =>
  preferencia === 'sistema' ? (sistemaPrefereClaro() ? 'claro' : 'escuro') : preferencia

/** Escolha salva (tema fixo ou "sistema"); sem escolha, escuro (o padrão do Releasy, mesmo com o sistema no claro). */
export function temaInicial(): Tema {
  return resolver(lerSalvo() ?? 'escuro')
}

export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = tema === 'claro' ? 'light' : 'dark'
}

let preferencia: PreferenciaTema | null = null
let atual: Tema | null = null
const ouvintes = new Set<() => void>()

function ler(): Tema {
  if (atual === null) atual = temaInicial()
  return atual
}

function lerPreferencia(): PreferenciaTema {
  if (preferencia === null) preferencia = lerSalvo() ?? 'escuro'
  return preferencia
}

function avisar() {
  ouvintes.forEach((ouvinte) => ouvinte())
}

/** Escolhe o tema (ou "seguir o sistema") e guarda a escolha neste aparelho. */
export function definirPreferenciaTema(nova: PreferenciaTema) {
  preferencia = nova
  atual = resolver(nova)
  aplicarTema(atual)
  salvar(nova)
  avisar()
}

export function definirTema(tema: Tema) {
  definirPreferenciaTema(tema)
}

export function alternarTema() {
  definirTema(ler() === 'claro' ? 'escuro' : 'claro')
}

/** Com "seguir o sistema", acompanha a troca de tema do sistema enquanto a página está aberta. */
export function acompanharSistema(): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  let consulta: MediaQueryList
  try {
    consulta = window.matchMedia('(prefers-color-scheme: light)')
  } catch {
    return () => undefined
  }
  if (typeof consulta?.addEventListener !== 'function') return () => undefined
  const mudou = () => {
    if (lerPreferencia() !== 'sistema') return
    atual = resolver('sistema')
    aplicarTema(atual)
    avisar()
  }
  consulta.addEventListener('change', mudou)
  return () => consulta.removeEventListener('change', mudou)
}

/** Só para testes: esquece o tema em memória (a próxima leitura volta a olhar o armazenamento). */
export function esquecerTema() {
  atual = null
  preferencia = null
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

export function usePreferenciaTema(): PreferenciaTema {
  return useSyncExternalStore(assinar, lerPreferencia, () => 'escuro')
}
