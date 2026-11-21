import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ME, chamadas, clienteFalso, json, montarApp, sessao, stubApi } from '../../test/app.ts'
import { CHAVE_TEMA, esquecerTema } from '../../ui/tema.ts'
import { loginGithubValido, pedeRevisaoDe } from './github.ts'
import { qrSeguro } from './mfa.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  esquecerTema()
})

/** Ordem global (vitest) da n-ésima chamada a uma rota no fetch falso. */
function ordemDa(f: ReturnType<typeof stubApi>, chave: string, n = 0) {
  const indices = f.mock.calls.flatMap(([url, init], i) =>
    `${init?.method ?? 'GET'} ${new URL(String(url), 'http://teste').pathname}` === chave ? [i] : [],
  )
  return f.mock.invocationCallOrder[indices[n]]
}

const MFA_NECESSARIO = { erro: 'Confirme o código de duas etapas pra continuar.', codigo: 'mfa_necessario' }

const VERIFICADO = { data: { all: [{ id: 'f1', status: 'verified', factor_type: 'totp' }], totp: [{ id: 'f1', status: 'verified' }] }, error: null }

describe('Minha conta', () => {
  it('perfil com o e-mail e o papel no workspace', async () => {
    stubApi()
    montarApp('#/conta')
    const perfil = await screen.findByRole('region', { name: 'Perfil' })
    expect(within(perfil).getByText('ana@exemplo.com')).toBeInTheDocument()
    expect(within(perfil).getByText('Dono no workspace Acme')).toBeInTheDocument()
  })

  it('login do GitHub: valida o formato e salva (com ou sem @)', async () => {
    const f = stubApi({ 'PUT /api/me/github': (init: RequestInit | undefined) => json({ githubLogin: JSON.parse(String(init?.body)).login }) })
    montarApp('#/conta')
    const campo = await screen.findByLabelText('Seu usuário do GitHub')
    fireEvent.change(campo, { target: { value: 'ana_dev' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use só letras, números e hífens')
    expect(chamadas(f, 'PUT /api/me/github')).toHaveLength(0)

    fireEvent.change(campo, { target: { value: '@ana-dev' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Login do GitHub salvo!')).toBeInTheDocument()
    expect(chamadas(f, 'PUT /api/me/github')[0].corpo).toEqual({ login: 'ana-dev' })
    expect(screen.getByText('Configurado')).toBeInTheDocument()
  })

  it('o login que veio do /api/me aparece preenchido', async () => {
    stubApi({ 'GET /api/me': { ...ME, githubLogin: 'ana-dev' } })
    montarApp('#/conta')
    expect(await screen.findByLabelText('Seu usuário do GitHub')).toHaveValue('ana-dev')
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('tema: escuro, claro ou seguir o sistema, salvo neste aparelho', async () => {
    stubApi()
    montarApp('#/conta')
    const grupo = await screen.findByRole('radiogroup', { name: 'Tema' })
    expect(within(grupo).getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Claro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem(CHAVE_TEMA)).toBe('claro')
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Sistema' }))
    expect(window.localStorage.getItem(CHAVE_TEMA)).toBe('sistema')
    expect(within(grupo).getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'true')
  })

  it('sessões: "Sair das outras sessões" usa o escopo others; "Sair da conta" sai', async () => {
    stubApi()
    const { auth, cliente } = clienteFalso()
    montarApp('#/conta', cliente)
    fireEvent.click(await screen.findByRole('button', { name: 'Sair das outras sessões' }))
    expect(await screen.findByText('Outras sessões encerradas')).toBeInTheDocument()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })
})

describe('Minha conta — verificação em duas etapas', () => {
  it('ativar: gera o QR code do SDK (data URI), confere o código e liga', async () => {
    const f = stubApi({ 'PUT /api/me/mfa': { mfaExigido: true } })
    const { auth, cliente } = clienteFalso()
    montarApp('#/conta', cliente)
    expect(await screen.findByText('Desligada')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gerar QR code' }))
    const modal = await screen.findByRole('dialog', { name: 'Escaneie o QR code' })
    expect(within(modal).getByRole('img', { name: /QR code/ })).toHaveAttribute('src', expect.stringMatching(/^data:image\/svg\+xml/))
    expect(within(modal).getByText('SEGREDO123')).toBeInTheDocument()
    expect(auth.mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: 'totp' }))

    fireEvent.change(within(modal).getByLabelText('Código de 6 números'), { target: { value: '12' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Ativar' }))
    expect(within(modal).getByRole('alert')).toHaveTextContent('O código tem 6 números')

    auth.mfa.listFactors.mockResolvedValue(VERIFICADO as never)
    fireEvent.change(within(modal).getByLabelText('Código de 6 números'), { target: { value: '123 456' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Ativar' }))
    expect(await screen.findByText('Verificação em duas etapas ligada!')).toBeInTheDocument()
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' })
    expect(await screen.findByText('Ligada')).toBeInTheDocument()
    // Depois do verify (sessão aal2), a API passa a exigir o código.
    expect(chamadas(f, 'PUT /api/me/mfa').map((c) => c.corpo)).toEqual([{ exigir: true }])
    expect(auth.mfa.challengeAndVerify.mock.invocationCallOrder[0]).toBeLessThan(ordemDa(f, 'PUT /api/me/mfa'))
  })

  it('ativar: se a API não salvar, avisa e não dá como ligada', async () => {
    stubApi({ 'PUT /api/me/mfa': 500 })
    const { cliente } = clienteFalso()
    montarApp('#/conta', cliente)
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gerar QR code' }))
    const modal = await screen.findByRole('dialog', { name: 'Escaneie o QR code' })
    fireEvent.change(within(modal).getByLabelText('Código de 6 números'), { target: { value: '123456' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Ativar' }))
    expect(await within(modal).findByRole('alert')).toHaveTextContent('Não deu pra salvar no Releasy')
    expect(screen.queryByText('Verificação em duas etapas ligada!')).not.toBeInTheDocument()
  })

  it('cancelar o cadastro pela metade desfaz o fator não verificado', async () => {
    stubApi()
    const { auth, cliente } = clienteFalso()
    montarApp('#/conta', cliente)
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gerar QR code' }))
    const modal = await screen.findByRole('dialog', { name: 'Escaneie o QR code' })
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' }))
  })

  it('QR code que não é imagem SVG em data URI não é desenhado', async () => {
    stubApi()
    const { auth, cliente } = clienteFalso()
    auth.mfa.enroll.mockResolvedValue({ data: { id: 'f1', type: 'totp', totp: { qr_code: 'javascript:alert(1)', secret: 'x', uri: 'x' } }, error: null } as never)
    montarApp('#/conta', cliente)
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gerar QR code' }))
    expect(await screen.findByText(/Não deu pra gerar o QR code/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument()
    expect(qrSeguro('https://exemplo.com/qr.svg')).toBeNull()
    expect(qrSeguro('data:image/svg+xml;utf-8,<svg/>')).toBe('data:image/svg+xml;utf-8,<svg/>')
  })

  it('desativar pede o código, verifica, desliga na API e só então remove o fator', async () => {
    const f = stubApi({ 'GET /api/me': { ...ME, mfaExigido: true }, 'PUT /api/me/mfa': { mfaExigido: false } })
    const { auth, cliente } = clienteFalso()
    auth.mfa.listFactors.mockResolvedValue(VERIFICADO as never)
    montarApp('#/conta', cliente)
    expect(await screen.findByText('Ligada')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
    const modal = screen.getByRole('dialog', { name: 'Desligar a verificação em duas etapas?' })
    fireEvent.change(within(modal).getByLabelText('Código de 6 números'), { target: { value: '654321' } })
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null } as never)
    fireEvent.click(within(modal).getByRole('button', { name: 'Desligar' }))
    expect(await screen.findByText('Verificação em duas etapas desligada')).toBeInTheDocument()
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '654321' })
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' })
    expect(chamadas(f, 'PUT /api/me/mfa').map((c) => c.corpo)).toEqual([{ exigir: false }])
    expect(auth.mfa.challengeAndVerify.mock.invocationCallOrder[0]).toBeLessThan(ordemDa(f, 'PUT /api/me/mfa'))
    expect(ordemDa(f, 'PUT /api/me/mfa')).toBeLessThan(auth.mfa.unenroll.mock.invocationCallOrder[0])
  })

  it('desativar: sem o código nada é chamado; se a API recusar, o fator fica', async () => {
    const f = stubApi({ 'GET /api/me': { ...ME, mfaExigido: true }, 'PUT /api/me/mfa': () => json(MFA_NECESSARIO, 403) })
    const { auth, cliente } = clienteFalso()
    auth.mfa.listFactors.mockResolvedValue(VERIFICADO as never)
    montarApp('#/conta', cliente)
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }))
    const modal = screen.getByRole('dialog', { name: 'Desligar a verificação em duas etapas?' })
    fireEvent.click(within(modal).getByRole('button', { name: 'Desligar' }))
    expect(within(modal).getByRole('alert')).toHaveTextContent('O código tem 6 números')
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled()
    expect(chamadas(f, 'PUT /api/me/mfa')).toHaveLength(0)

    fireEvent.change(within(modal).getByLabelText('Código de 6 números'), { target: { value: '654321' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Desligar' }))
    expect(await within(modal).findByRole('alert')).toHaveTextContent('Não deu pra salvar no Releasy')
    expect(auth.mfa.unenroll).not.toHaveBeenCalled()
  })

  it('403 mfa_necessario em qualquer chamada leva à etapa do código, sem deslogar', async () => {
    let aal2 = false
    stubApi({
      'GET /api/me': { ...ME, mfaExigido: true },
      'GET /api/bugs': () => (aal2 ? json([]) : json(MFA_NECESSARIO, 403)),
    })
    const { auth, cliente, emitir } = clienteFalso()
    auth.mfa.listFactors.mockResolvedValue(VERIFICADO as never)
    montarApp('#/bugs', cliente)
    expect(await screen.findByRole('heading', { name: 'Só mais um passo' })).toBeInTheDocument()
    expect(auth.signOut).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '111222' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar código' }))
    await waitFor(() => expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '111222' }))
    aal2 = true
    emitir('MFA_CHALLENGE_VERIFIED', { ...sessao, access_token: 'tok-aal2' } as Session)
    expect(await screen.findByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Só mais um passo' })).not.toBeInTheDocument()
  })

  it('sessão aal2 com duas etapas ligadas antes de a API exigir: liga na API', async () => {
    const f = stubApi({ 'PUT /api/me/mfa': { mfaExigido: true } })
    const { auth, cliente } = clienteFalso()
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null } as never)
    montarApp('#/inicio', cliente)
    await waitFor(() => expect(chamadas(f, 'PUT /api/me/mfa').map((c) => c.corpo)).toEqual([{ exigir: true }]))
  })

  it('login com duas etapas ligadas: pede o código antes de mostrar o app', async () => {
    stubApi()
    const { auth, cliente, emitir } = clienteFalso()
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null } as never)
    auth.mfa.listFactors.mockResolvedValue(VERIFICADO as never)
    montarApp('#/inicio', cliente)
    expect(await screen.findByRole('heading', { name: 'Só mais um passo' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '111222' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar código' }))
    await waitFor(() => expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '111222' }))

    // O Supabase troca a sessão por uma aal2.
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null } as never)
    emitir('MFA_CHALLENGE_VERIFIED', { ...sessao, access_token: 'tok-aal2' } as Session)
    expect(await screen.findByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument()
  })

  it('regras do login do GitHub e de quem pede revisão', () => {
    expect(loginGithubValido('ana-dev')).toBe(true)
    expect(loginGithubValido('a'.repeat(39))).toBe(true)
    for (const ruim of ['-ana', 'ana-', 'a--b', 'ana dev', 'a'.repeat(40), '']) expect(loginGithubValido(ruim)).toBe(false)
    expect(pedeRevisaoDe(['Luis', 'carla'], 'luis')).toBe(true)
    expect(pedeRevisaoDe(['carla'], 'luis')).toBe(false)
    expect(pedeRevisaoDe(['luis'], null)).toBe(false)
  })
})
