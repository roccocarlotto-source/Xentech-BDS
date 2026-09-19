import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

// Cliente único de Supabase para toda la app — auth (login/logout/sesión) y,
// más adelante, cualquier uso directo del SDK. El resto del código nunca
// instancia otro cliente.
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);
