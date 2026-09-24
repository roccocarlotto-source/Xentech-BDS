import { Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

// Envoltorio de las rutas públicas (sin sesión, ej. /r/:token). No pide
// login, pero SÍ espera a que AuthProvider termine de inicializar: al
// resolver la identidad inicial (haya sesión o no), AuthProvider hace
// queryClient.clear() -- si la página pública ya había disparado su query,
// ese clear la deja colgada en "Cargando…" para siempre. Esperar a
// "initializing" evita la carrera; es un instante (Supabase lee la sesión
// del storage local, sin red).
export function PublicRoute() {
  const { status } = useAuth();

  if (status === "initializing") {
    return <div className="page-message">Cargando…</div>;
  }

  return <Outlet />;
}
