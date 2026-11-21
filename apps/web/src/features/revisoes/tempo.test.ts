import { describe, expect, it } from 'vitest'
import { haQuantoTempo } from './tempo.ts'

const agora = new Date('2026-11-20T12:00:00.000Z')
const atras = (ms: number) => new Date(agora.getTime() - ms).toISOString()
const MIN = 60_000
const H = 60 * MIN

describe('haQuantoTempo', () => {
  it('minutos', () => {
    expect(haQuantoTempo(atras(5 * MIN), agora)).toBe('há 5 min')
    expect(haQuantoTempo(atras(59 * MIN), agora)).toBe('há 59 min')
  })
  it('horas', () => {
    expect(haQuantoTempo(atras(60 * MIN), agora)).toBe('há 1 h')
    expect(haQuantoTempo(atras(3 * H), agora)).toBe('há 3 h')
    expect(haQuantoTempo(atras(23 * H), agora)).toBe('há 23 h')
  })
  it('dias', () => {
    expect(haQuantoTempo(atras(48 * H), agora)).toBe('há 2 dias')
    expect(haQuantoTempo(atras(10 * 24 * H), agora)).toBe('há 10 dias')
  })
})
