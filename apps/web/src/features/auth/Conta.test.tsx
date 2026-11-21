import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clienteFalso, montarApp, sessao, stubApi } from '../../test/app.ts'
import { forcaSenha, tipoDeFalha } from './senha.ts'
import type { AuthError } from '@supabase/supabase-js'

const NEUTRA_CONTA = /Se der tudo certo com esse endereço, chega um link pra confirmar sua conta/
const NEUTRA_SENHA = /Se existir uma conta com esse endereço, mandamos um link/

const erroAuth = (status: number, code?: string, name = 'AuthApiError') => ({ status, code, name, message: 'x' }) as unknown as AuthError

function preencherConta({ nome = 'Ana Souza', email = 'ana@exemplo.com', senha = 'Segura#2026', termos = true } = {}) {
  const form = screen.getByRole('form', { name: 'Criar conta' })
  fireEvent.change(within(form).getByLabelText('Seu nome'), { target: { value: nome } })
  fireEvent.change(within(form).getByLabelText('E-mail'), { target: { value: email } })
  fireEvent.change(within(form).getByLabelText('Senha'), { target: { value: senha } })
  const caixa = within(form).getByRole<HTMLInputElement>('checkbox')
  if (caixa.checked !== termos) fireEvent.click(caixa)
  fireEvent.click(within(form).getByRole('button', { name: 'Criar conta' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Entrar — atalhos', () => {
  it('tem "Esqueci a senha" e "Criar conta", e os links trocam a tela', async () => {
    stubApi()
    montarApp('/', clienteFalso(null).cliente)
    const form = await screen.findByRole('form', { name: 'Entrar no portal' })
    expect(within(form).getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute('href', '#/esqueci')
    expect(within(form).getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '#/criar-conta')
    window.history.pushState(null, '', '#/criar-conta')
    fireEvent(window, new PopStateEvent('popstate'))
    expect(await screen.findByRole('form', { name: 'Criar conta' })).toBeInTheDocument()
  })
})

describe('Criar conta', () => {
  it('valida no cliente (nome, e-mail, senha forte, termos) antes de chamar o Supabase', async () => {
    stubApi()
    const { auth, cliente } = clienteFalso(null)
    montarApp('#/criar-conta', cliente)
    await screen.findByRole('form', { name: 'Criar conta' })
    preencherConta({ nome: '  ' })
    expect(screen.getByRole('alert')).toHaveTextContent('Faltou o seu nome')
    preencherConta({ email: 'ana@' })
    expect(screen.getByRole('alert')).toHaveTextContent('Esse e-mail parece incompleto')
    preencherConta({ senha: 'abc12345', termos: false })
    expect(screen.getByRole('alert')).toHaveTextContent('Bora uma senha mais forte')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true')
    preencherConta({ termos: false })
    expect(screen.getByRole('alert')).toHaveTextContent('aceita os termos')
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('mostra a força da senha enquanto digita', async () => {
    stubApi()
    montarApp('#/criar-conta', clienteFalso(null).cliente)
    const senha = await screen.findByLabelText('Senha')
    fireEvent.change(senha, { target: { value: 'abcdefgh' } })
    expect(senha).toHaveAccessibleDescription('Fraca. Bora caprichar mais.')
    fireEvent.change(senha, { target: { value: 'Segura#2026!' } })
    expect(senha).toHaveAccessibleDescription('Excelente!')
    expect(document.querySelectorAll('.forca i.ligado')).toHaveLength(4)
    expect(forcaSenha('abcdefgh')).toBe(1)
    expect(forcaSenha('abcdefg1')).toBe(2)
    expect(forcaSenha('abcdefg1!')).toBe(3)
  })

  it('sucesso: chama signUp com nome e volta, e mostra a mensagem neutra', async () => {
    stubApi()
    const { auth, cliente } = clienteFalso(null)
    montarApp('#/criar-conta', cliente)
    await screen.findByRole('form', { name: 'Criar conta' })
    preencherConta()
    expect(await screen.findByText(NEUTRA_CONTA)).toBeInTheDocument()
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'ana@exemplo.com',
      password: 'Segura#2026',
      options: { data: { nome: 'Ana Souza' }, emailRedirectTo: `${window.location.origin}/` },
    })
    expect(screen.getByRole('link', { name: 'Voltar para o login' })).toHaveAttribute('href', '#/entrar')
  })

  it('e-mail que já tem conta recebe exatamente a mesma resposta (não revela nada)', async () => {
    stubApi()
    const { auth, cliente } = clienteFalso(null)
    auth.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: erroAuth(422, 'user_already_exists') } as never)
    montarApp('#/criar-conta', cliente)
    await screen.findByRole('form', { name: 'Criar conta' })
    preencherConta()
    expect(await screen.findByText(NEUTRA_CONTA)).toBeInTheDocument()
    expect(screen.queryByText(/já/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('limite de tentativas e falta de conexão viram mensagens que dizem o que fazer', async () => {
    stubApi()
    const { auth, cliente } = clienteFalso(null)
    auth.signUp
      .mockResolvedValueOnce({ data: { user: null, session: null }, error: erroAuth(429, 'over_email_send_rate_limit') } as never)
      .mockResolvedValueOnce({ data: { user: null, session: null }, error: erroAuth(0, undefined, 'AuthRetryableFetchError') } as never)
    montarApp('#/criar-conta', cliente)
    await screen.findByRole('form', { name: 'Criar conta' })
    preencherConta()
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas seguidas')
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Confere a conexão'))
  })

  it('se o Supabase já devolve sessão (sem confirmação por e-mail), entra direto', async () => {
    stubApi()
    const { auth, cliente, emitir } = clienteFalso(null)
    auth.signUp.mockImplementationOnce(async () => {
      emitir('SIGNED_IN', sessao)
      return { data: { user: null, session: sessao }, error: null } as never
    })
    montarApp('#/criar-conta', cliente)
    await screen.findByRole('form', { name: 'Criar conta' })
    preencherConta()
    expect(await screen.findByText('Conta criada!')).toBeInTheDocument()
    expect(await screen.findByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument()
  })
})

describe('Esqueci a senha', () => {
  it('valida o e-mail e manda o link com a volta para o site', async () => {
    stubApi()
    const { auth, cliente } = clienteFalso(null)
    montarApp('#/esqueci', cliente)
    const form = await screen.findByRole('form', { name: 'Esqueci a senha' })
    fireEvent.click(within(form).getByRole('button', { name: 'Enviar link' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Esse e-mail parece incompleto')
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled()
    fireEvent.change(within(form).getByLabelText('E-mail'), { target: { value: ' ana@exemplo.com ' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Enviar link' }))
    expect(await screen.findByText(NEUTRA_SENHA)).toBeInTheDocument()
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@exemplo.com', { redirectTo: `${window.location.origin}/` })
  })

  it('erro do servidor (ex.: e-mail sem conta) dá a mesma resposta neutra', async () => {
    stubApi()
    const { auth, cliente } = clienteFalso(null)
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: erroAuth(400, 'user_not_found') } as never)
    montarApp('#/esqueci', cliente)
    const form = await screen.findByRole('form', { name: 'Esqueci a senha' })
    fireEvent.change(within(form).getByLabelText('E-mail'), { target: { value: 'ninguem@exemplo.com' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Enviar link' }))
    expect(await screen.findByText(NEUTRA_SENHA)).toBeInTheDocument()
  })

  it('sem conexão: avisa e deixa tentar de novo', async () => {
    stubApi()
    const { auth, cliente } = clienteFalso(null)
    auth.resetPasswordForEmail.mockRejectedValueOnce(new TypeError('rede'))
    montarApp('#/esqueci', cliente)
    const form = await screen.findByRole('form', { name: 'Esqueci a senha' })
    fireEvent.change(within(form).getByLabelText('E-mail'), { target: { value: 'ana@exemplo.com' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Enviar link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Confere a conexão')
    expect(screen.queryByText(NEUTRA_SENHA)).not.toBeInTheDocument()
  })

  it('tipoDeFalha nunca separa "conta existe" de "não existe"', () => {
    expect(tipoDeFalha(null)).toBeNull()
    expect(tipoDeFalha(erroAuth(422, 'user_already_exists'))).toBe('outra')
    expect(tipoDeFalha(erroAuth(400, 'user_not_found'))).toBe('outra')
    expect(tipoDeFalha(erroAuth(429))).toBe('limite')
    expect(tipoDeFalha(erroAuth(422, 'weak_password'))).toBe('senha')
  })
})

describe('Senha nova (volta do link do e-mail)', () => {
  it('evento PASSWORD_RECOVERY pede a senha nova; salvar chama updateUser e entra', async () => {
    stubApi()
    const { auth, cliente, emitir } = clienteFalso(null)
    montarApp('/', cliente)
    await screen.findByRole('form', { name: 'Entrar no portal' })
    emitir('PASSWORD_RECOVERY', sessao)
    const form = await screen.findByRole('form', { name: 'Criar senha nova' })
    fireEvent.change(within(form).getByLabelText('Senha nova'), { target: { value: 'fraca' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Salvar senha' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Bora uma senha mais forte')
    fireEvent.change(within(form).getByLabelText('Senha nova'), { target: { value: 'Nova#Senha2026' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Salvar senha' }))
    expect(await screen.findByText('Senha nova salva!')).toBeInTheDocument()
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'Nova#Senha2026' })
    expect(await screen.findByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument()
  })
})
