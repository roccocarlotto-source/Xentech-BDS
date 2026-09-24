import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

// Gate de módulo habilitado para la organización, espejo de
// requireAgentEnabled del backend (src/middlewares/requireAgentEnabled.ts).
// Se anida dentro de <ProtectedRoute/>.
export function RequireAgente({ agentType }: { agentType: string }) {
  const { me } = useAuth();

  if (!me || me.isPlatformAdmin || !me.agentesHabilitados?.includes(agentType)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
