import { describe, expect, it } from 'vitest'
import { formatarNumero } from './formatar.ts'

describe('formatarNumero', () => {
  it('usa mi e mil com vírgula decimal em português', () => {
    expect(formatarNumero(1353831)).toBe('1,4 mi')
    expect(formatarNumero(760000)).toBe('760 mil')
  })

  it('valores abaixo de mil não ganham sufixo', () => {
    expect(formatarNumero(0)).toBe('0')
    expect(formatarNumero(999)).toBe('999')
    expect(formatarNumero(42)).not.toMatch(/mil|mi/)
  })
})
