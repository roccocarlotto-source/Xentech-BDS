import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

// Gate de rol para pantallas que el backend protege con requireOrgAdmin --
// admin de la PROPIA organización, nunca un platform admin (ver
// src/middlewares/authorize.ts del backend). Nace en Fase 5 con la
// pantalla de configuración del agente de WhatsApp; se anida dentro de
// <ProtectedRoute/> (que ya cubrió "hay sesión"), acá solo se agrega el
// chequeo de rol.
export function RequireOrgAdmin() {
  const { me } = useAuth();

  if (!me || me.isPlatformAdmin || me.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
