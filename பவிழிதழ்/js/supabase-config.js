/* Supabase public client configuration for Pavizhidhal.
   Publishable keys are designed for browser use; never put service_role/secret keys here. */
window.PAVIZHIDHAL_SUPABASE_URL = "https://guuowevezqqscpppehcr.supabase.co";
window.PAVIZHIDHAL_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_HonZEhmBJBT5N34Ub3XAIg_UWZPKGkD";
window.pavizhidhalSupabase = window.supabase.createClient(
  window.PAVIZHIDHAL_SUPABASE_URL,
  window.PAVIZHIDHAL_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
