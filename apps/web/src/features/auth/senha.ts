import type { AuthError } from '@supabase/supabase-js'

/** 0 a 4: 8+ caracteres, letras e números, símbolo, 12+ caracteres. A partir de 3 dá pra usar. */
export const forcaSenha = (s: string): number =>
  [s.length >= 8, /[a-zA-Z]/.test(s) && /\d/.test(s), /[^a-zA-Z0-9]/.test(s), s.length >= 12].filter(Boolean).length

export const FORCA_MINIMA = 3

export const TEXTO_FORCA = [
  'Use 8+ caracteres com letras, números e um símbolo.',
  'Fraca. Bora caprichar mais.',
  'Quase lá!',
  'Boa, senha forte.',
  'Excelente!',
]

export const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

export type Falha = 'conexao' | 'limite' | 'senha' | 'outra'

/**
 * Classifica o erro do Supabase sem nunca dizer se o e-mail existe: "já cadastrado" e afins caem
 * em 'outra', que as telas tratam igual ao sucesso (mensagem neutra).
 */
export function tipoDeFalha(erro: AuthError | null): Falha | null {
  if (!erro) return null
  const { status, code, name } = erro as AuthError & { code?: string }
  if (name === 'AuthRetryableFetchError' || !status) return 'conexao'
  if (status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'limite'
  if (code === 'weak_password') return 'senha'
  return 'outra'
}

export const MENSAGEM_FALHA: Record<Exclude<Falha, 'outra'>, string> = {
  conexao: 'Não deu pra falar com o servidor. Confere a conexão e tenta de novo.',
  limite: 'Muitas tentativas seguidas. Espera um minutinho e tenta de novo.',
  senha: 'Essa senha não passou na regra do servidor. Tenta uma mais longa, misturando letras, números e símbolos.',
}
