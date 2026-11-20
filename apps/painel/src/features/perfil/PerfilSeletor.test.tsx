import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import PerfilSeletor from './PerfilSeletor.tsx'
import { clienteContrato, type Opcoes } from '../../test/clienteContrato.ts'

const linhas: Opcoes['linhas'] = {
  sincronizacao: [{ perfil_ativo: 'principal', perfis_disponiveis: ['principal', 'economico', 'rapido'] }],
}

describe('PerfilSeletor', () => {
  it('mostra o perfil ativo no selo a partir de sincronizacao.perfil_ativo', async () => {
    const { cliente } = clienteContrato({ linhas })
    const { container } = render(<PerfilSeletor cliente={cliente} />)
    await screen.findByRole('combobox')
    const selo = container.querySelector('.selo')
    expect(selo).not.toBeNull()
    expect(selo).toHaveTextContent('principal')
  })

  it('lista no seletor os perfis de perfis_disponiveis', async () => {
    const { cliente } = clienteContrato({ linhas })
    render(<PerfilSeletor cliente={cliente} />)
    await screen.findByRole('combobox')
    const nomes = screen.getAllByRole('option').map((o) => o.textContent)
    expect(nomes).toEqual(expect.arrayContaining(['principal', 'economico', 'rapido']))
  })

  it('escolher outro perfil e confirmar grava trocar_perfil com args {perfil}', async () => {
    const usuario = userEvent.setup()
    const { cliente, inserts } = clienteContrato({ linhas })
    render(<PerfilSeletor cliente={cliente} />)
    await usuario.selectOptions(await screen.findByRole('combobox'), 'economico')
    await usuario.click(screen.getByRole('button', { name: /trocar/i }))
    expect(
      screen.getByText(/O agente passa a usar o perfil economico a partir da próxima tarefa/i),
    ).toBeInTheDocument()
    expect(inserts).toHaveLength(0)
    await usuario.click(screen.getByRole('button', { name: /confirmar/i }))
    await screen.findByRole('status')
    expect(inserts).toEqual([{ tabela: 'comandos', valor: { comando: 'trocar_perfil', args: { perfil: 'economico' } } }])
  })

  it('cancelar a confirmação não grava nada em comandos', async () => {
    const usuario = userEvent.setup()
    const { cliente, inserts } = clienteContrato({ linhas })
    render(<PerfilSeletor cliente={cliente} />)
    await usuario.selectOptions(await screen.findByRole('combobox'), 'rapido')
    await usuario.click(screen.getByRole('button', { name: /trocar/i }))
    await usuario.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(inserts).toHaveLength(0)
    expect(screen.queryByText(/a partir da próxima tarefa/i)).not.toBeInTheDocument()
  })

  it('mostra carregando enquanto a consulta não responde', () => {
    const { cliente } = clienteContrato({ pendente: true })
    render(<PerfilSeletor cliente={cliente} />)
    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('no erro mostra Tentar de novo, que volta para carregando', async () => {
    const usuario = userEvent.setup()
    const opcoes: Opcoes = { linhas, erro: true }
    const { cliente } = clienteContrato(opcoes)
    render(<PerfilSeletor cliente={cliente} />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    opcoes.erro = false
    opcoes.pendente = true
    await usuario.click(screen.getByRole('button', { name: /tentar de novo/i }))
    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('o cliente falso recusa coluna fora do contrato (perfil_ativo, perfis_disponiveis e args fazem parte dele)', async () => {
    const { cliente } = clienteContrato({ linhas })
    expect(() => cliente.from('sincronizacao').select('perfil_ativo, perfis_disponiveis')).not.toThrow()
    expect(() => cliente.from('sincronizacao').select('perfil_secreto')).toThrow(/fora do contrato/)
    await expect(cliente.from('comandos').insert({ comando: 'trocar_perfil', args: { perfil: 'x' } })).resolves.toBeDefined()
    await expect(cliente.from('comandos').insert({ comando: 'x', outra: 1 })).rejects.toThrow(/fora do contrato/)
    render(<PerfilSeletor cliente={cliente} />)
    expect(await screen.findByRole('combobox')).toBeInTheDocument()
  })
})
