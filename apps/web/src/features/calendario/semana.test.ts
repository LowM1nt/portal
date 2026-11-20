import { describe, expect, it } from 'vitest'
import { diasDaSemana, proximaSemana, rotuloSemana, semanaAnterior } from './semana.ts'

describe('semana — rótulo ISO', () => {
  it('gera o rótulo AAAA-Www de uma data qualquer', () => {
    expect(rotuloSemana(new Date(2026, 10, 20))).toBe('2026-W47')
    expect(rotuloSemana(new Date(2026, 10, 16))).toBe('2026-W47') // segunda
    expect(rotuloSemana(new Date(2026, 10, 22))).toBe('2026-W47') // domingo
    expect(rotuloSemana(new Date(2026, 2, 4))).toBe('2026-W10')
  })

  it('1º de janeiro e 31 de dezembro na virada de ano, inclusive semana 53', () => {
    expect(rotuloSemana(new Date(2021, 0, 1))).toBe('2020-W53')
    expect(rotuloSemana(new Date(2020, 11, 31))).toBe('2020-W53')
    expect(rotuloSemana(new Date(2027, 0, 1))).toBe('2026-W53')
    expect(rotuloSemana(new Date(2026, 0, 1))).toBe('2026-W01')
    expect(rotuloSemana(new Date(2024, 11, 31))).toBe('2025-W01')
    expect(rotuloSemana(new Date(2023, 0, 1))).toBe('2022-W52')
  })
})

describe('semana — anterior e próxima', () => {
  it('devolvem rótulos consecutivos no meio do ano', () => {
    expect(proximaSemana('2026-W47')).toBe('2026-W48')
    expect(semanaAnterior('2026-W47')).toBe('2026-W46')
    expect(proximaSemana('2026-W09')).toBe('2026-W10')
  })

  it('devolvem rótulos consecutivos corretos na virada de ano', () => {
    expect(semanaAnterior('2021-W01')).toBe('2020-W53')
    expect(proximaSemana('2020-W53')).toBe('2021-W01')
    expect(proximaSemana('2026-W53')).toBe('2027-W01')
    expect(semanaAnterior('2027-W01')).toBe('2026-W53')
    expect(proximaSemana('2024-W52')).toBe('2025-W01')
    expect(semanaAnterior('2025-W01')).toBe('2024-W52')
  })
})

describe('semana — dias do cabeçalho', () => {
  it('lista os 7 dias da semana, de segunda a domingo', () => {
    const dias = diasDaSemana('2026-W47')
    expect(dias).toHaveLength(7)
    expect(dias[0].getDay()).toBe(1)
    expect(dias[6].getDay()).toBe(0)
    expect([dias[0].getMonth(), dias[0].getDate()]).toEqual([10, 16])
    expect([dias[6].getMonth(), dias[6].getDate()]).toEqual([10, 22])
  })

  it('atravessa a virada de ano', () => {
    const dias = diasDaSemana('2020-W53')
    expect([dias[0].getFullYear(), dias[0].getMonth(), dias[0].getDate()]).toEqual([2020, 11, 28])
    expect([dias[6].getFullYear(), dias[6].getMonth(), dias[6].getDate()]).toEqual([2021, 0, 3])
  })
})
