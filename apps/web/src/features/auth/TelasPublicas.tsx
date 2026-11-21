import type { SupabaseClient } from '@supabase/supabase-js'
import { useRota } from '../../ui/rota.ts'
import { CriarConta } from './CriarConta.tsx'
import { Entrar } from './Entrar.tsx'
import { Esqueci } from './Esqueci.tsx'

/** Quem não entrou vê Entrar, Criar conta ou Esqueci a senha, conforme o endereço. */
export function TelasPublicas({ cliente }: { cliente: SupabaseClient }) {
  const [rota] = useRota()
  const tela = rota.partes[0]
  if (tela === 'criar-conta') return <CriarConta cliente={cliente} />
  if (tela === 'esqueci') return <Esqueci cliente={cliente} />
  return <Entrar cliente={cliente} />
}
