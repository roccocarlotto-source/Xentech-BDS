import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

// Gate de rol para el inbox de conversaciones derivadas (Fase 5, paso 4),
// espejo de requireInboxAccess del backend: el admin de la organización
// siempre entra; un MEMBER solo si tiene el permiso otorgado
// (me.canHandleInbox). Se anida dentro de <ProtectedRoute/>, igual que
// RequireOrgAdmin.
export function RequireInboxAccess() {
  const { me } = useAuth();

  const tieneAcceso = !!me && !me.isPlatformAdmin && (me.role === "ADMIN" || me.canHandleInbox);

  if (!tieneAcceso) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
