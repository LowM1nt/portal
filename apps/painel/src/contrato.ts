// Tabelas e colunas do Supabase que o painel pode usar. Espelha docs/eventos.md; o teste compara os dois.
export const CONTRATO = {
  eventos: ['id', 'ts', 'tipo', 'origem', 'tarefa_id', 'dados'],
  sincronizacao: ['ultima_vez', 'perfil_ativo', 'perfis_disponiveis'],
  posts: ['id', 'texto', 'publicar_em'],
  comandos: ['comando', 'args'],
} as const

export type Tabela = keyof typeof CONTRATO
