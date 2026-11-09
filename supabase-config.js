// Configuracao central do Supabase. Unica instancia do cliente (window.db).
// Apenas a chave publicavel. NUNCA colocar service_role aqui.
const SUPABASE_URL = 'https://zeddzzklziqhqgsuxwdw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hO8o42rTAwrrKPA6qf9usA_uRHzyiS_';

window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});
