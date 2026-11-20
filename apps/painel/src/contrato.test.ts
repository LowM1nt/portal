import { describe, expect, it } from 'vitest'
import docs from '../../../docs/eventos.md?raw'
import { CONTRATO } from './contrato.ts'
import { clienteContrato } from './test/clienteContrato.ts'

function colunasDoDoc(): string[] {
  const linha = docs.split('\n').find((l) => l.startsWith('Colunas:')) ?? ''
  return [...linha.matchAll(/`(\w+)`\s*\(/g)].map((m) => m[1])
}

function tabelasDoDoc(): string[] {
  return [...new Set([...docs.matchAll(/public\.(\w+)/g)].map((m) => m[1]))]
}

describe('contrato.ts × docs/eventos.md', () => {
  it('tem exatamente as tabelas citadas em docs/eventos.md', () => {
    expect(Object.keys(CONTRATO).sort()).toEqual(tabelasDoDoc().sort())
    expect(Object.keys(CONTRATO).sort()).toEqual(['comandos', 'eventos', 'posts', 'sincronizacao'])
  })

  it('eventos tem as colunas do doc e sincronizacao tem ultima_vez', () => {
    expect([...CONTRATO.eventos].sort()).toEqual(colunasDoDoc().sort())
    expect(CONTRATO.eventos).toEqual(expect.arrayContaining(['ts', 'tipo', 'dados']))
    expect(CONTRATO.sincronizacao).toContain('ultima_vez')
    expect(CONTRATO.comandos).toContain('comando')
    expect(CONTRATO.posts).toEqual(expect.arrayContaining(['id', 'texto', 'publica_em']))
  })

  it('não contém as colunas antigas que não existem no Supabase', () => {
    expect(CONTRATO.eventos).not.toContain('criado_em')
    expect(CONTRATO.eventos).not.toContain('tokens')
    expect(CONTRATO.sincronizacao).not.toContain('sincronizado_em')
  })
})

describe('cliente falso do contrato', () => {
  it('lança erro para tabela fora do contrato', () => {
    const { cliente } = clienteContrato()
    expect(() => cliente.from('usuarios')).toThrow(/contrato/)
  })

  it('lança erro para colunas antigas e para select("*")', () => {
    const { cliente } = clienteContrato()
    expect(() => cliente.from('eventos').select('id, criado_em')).toThrow(/criado_em/)
    expect(() => cliente.from('eventos').select('tokens')).toThrow(/tokens/)
    expect(() => cliente.from('sincronizacao').select('sincronizado_em')).toThrow(/sincronizado_em/)
    expect(() => cliente.from('eventos').select('*')).toThrow()
    expect(() => cliente.from('eventos').select('ts').order('criado_em')).toThrow(/criado_em/)
  })

  it('aceita a consulta dentro do contrato', () => {
    const { cliente } = clienteContrato()
    expect(() => cliente.from('eventos').select('ts, tipo, dados').eq('tipo', 'noite_resumo').order('ts').limit(10)).not.toThrow()
  })
})
