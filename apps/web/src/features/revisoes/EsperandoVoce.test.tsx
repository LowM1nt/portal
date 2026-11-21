import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ME, ha, montarApp, stubApi } from '../../test/app.ts'

const pr = (numero: number, revisores: string[]) => ({
  numero,
  titulo: `PR ${numero}`,
  autor: 'carla',
  url: `https://github.com/acme/portal/pull/${numero}`,
  repositorio: 'acme/portal',
  revisores,
  statusCi: 'sucesso',
  atualizadaEm: ha(2),
})
const PRS = [pr(1, ['Luis']), pr(2, ['bia']), pr(3, ['luis', 'bia'])]
const comLogin = { ...ME, githubLogin: 'luis' }

const numero = (rotulo: string) => screen.getByText(rotulo, { selector: 'small' }).closest('.numero') as HTMLElement

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('"Esperando você" com o login do GitHub', () => {
  it('Início: conta e lista só as PRs que pedem a sua revisão (sem diferenciar maiúsculas)', async () => {
    stubApi({ 'GET /api/me': comLogin, 'GET /api/revisoes': PRS })
    montarApp('#/inicio')
    await screen.findByRole('heading', { name: 'Esperando você' })
    expect(within(numero('Esperando você')).getByText('2')).toBeInTheDocument()
    const bloco = screen.getByRole('region', { name: 'Esperando você' })
    expect(within(bloco).getAllByRole('link', { name: /^PR / }).map((a) => a.textContent)).toEqual(['PR 1', 'PR 3'])
    expect(screen.queryByText(/Configure seu login do GitHub/)).not.toBeInTheDocument()
    // A bolinha das Revisões também conta só as suas.
    await waitFor(() => expect(screen.getByTestId('contador-revisoes')).toHaveTextContent('2'))
  })

  it('Início sem login: fila do time e dica pra configurar', async () => {
    stubApi({ 'GET /api/revisoes': PRS })
    montarApp('#/inicio')
    await screen.findByRole('heading', { name: 'Esperando revisão' })
    expect(within(numero('Esperando revisão')).getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Configure seu login do GitHub' })).toHaveAttribute('href', '#/conta')
  })

  it('Revisões: começa em "Esperando você" e "Todas" mostra a fila inteira', async () => {
    stubApi({ 'GET /api/me': comLogin, 'GET /api/revisoes': PRS })
    montarApp('#/revisoes')
    const abas = await screen.findByRole('navigation', { name: 'Quais PRs mostrar' })
    expect(within(abas).getByRole('link', { name: /Esperando você/ })).toHaveAttribute('aria-current', 'true')
    const lista = screen.getByRole('list', { name: 'PRs esperando revisão' })
    expect(within(lista).getAllByRole('link').map((a) => a.textContent)).toEqual(['PR 1', 'PR 3'])

    window.history.replaceState(null, '', '/#/revisoes?f=todas')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'PRs esperando revisão' })).getAllByRole('link')).toHaveLength(3))
    expect(within(screen.getByRole('navigation', { name: 'Quais PRs mostrar' })).getByRole('link', { name: /Todas/ })).toHaveAttribute('aria-current', 'true')
  })

  it('Revisões sem login: a fila do time, com dica pra configurar', async () => {
    stubApi({ 'GET /api/revisoes': PRS })
    montarApp('#/revisoes')
    expect(await screen.findByText(/pra ver só o que espera a sua revisão/)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Quais PRs mostrar' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'PRs esperando revisão' })).getAllByRole('link')).toHaveLength(3)
  })

  it('nada pedindo a sua revisão: vazio que aponta pra "Todas"', async () => {
    stubApi({ 'GET /api/me': comLogin, 'GET /api/revisoes': [pr(2, ['bia'])] })
    montarApp('#/revisoes')
    expect(await screen.findByText('Nada esperando você')).toBeInTheDocument()
  })
})
