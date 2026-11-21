/** Mesma regra da API: 1 a 39 letras, números ou hífens; sem hífen no começo, no fim ou dois seguidos. */
export const loginGithubValido = (login: string) => /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(login)

/** O login pediu a revisão? O GitHub não diferencia maiúsculas no usuário. */
export const pedeRevisaoDe = (revisores: string[], login: string | null) =>
  login !== null && revisores.some((r) => r.toLowerCase() === login.toLowerCase())
