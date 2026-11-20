import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Só a chave pública (publishable) entra no site: quem protege os dados é o RLS do Supabase.
const url = import.meta.env.VITE_SUPABASE_URL
const chavePublica = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase: SupabaseClient | null =
  url && chavePublica ? createClient(url, chavePublica) : null
