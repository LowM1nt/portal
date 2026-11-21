/**
 * Convite: o link é `/convite#token=…` (o token vem no fragmento, que não vai para log de servidor).
 * O token fica só nesta aba (sessionStorage) até ser aceito; nunca vai em query string nem em log.
 */
const CHAVE = 'releasy-convite'

// 32 bytes em Base64Url sem preenchimento = 43 caracteres (o mesmo formato que a API gera).
const FORMATO = /^[A-Za-z0-9_-]{43}$/

export function guardarConvite(token: string | null) {
  try {
    if (token) window.sessionStorage.setItem(CHAVE, token)
    else window.sessionStorage.removeItem(CHAVE)
  } catch {
    // armazenamento bloqueado: o convite precisa ser aberto de novo depois de entrar
  }
}

export function convitePendente(): string | null {
  try {
    const token = window.sessionStorage.getItem(CHAVE)
    return token && FORMATO.test(token) ? token : null
  } catch {
    return null
  }
}

/**
 * Chegou pelo link do convite? Guarda o token, limpa o endereço (some o fragmento) e segue para o Início.
 * Fora de /convite não faz nada.
 */
export function capturarConvite() {
  if (window.location.pathname.replace(/\/+$/, '') !== '/convite') return
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const token = params.get('token')
  if (token && FORMATO.test(token)) guardarConvite(token)
  window.history.replaceState(null, '', '/')
}
