import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { RequireOrgAdmin } from "./auth/RequireOrgAdmin";
import { RequireInboxAccess } from "./auth/RequireInboxAccess";
import { useAuth } from "./auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { ClientesPage } from "./pages/ClientesPage";
import { ImportClientesPage } from "./pages/ImportClientesPage";
import { AdminOrganizationsPage } from "./pages/AdminOrganizationsPage";
import { AgentConfigPage } from "./pages/AgentConfigPage";
import { InboxPage } from "./pages/InboxPage";
import { UsersPage } from "./pages/UsersPage";
import { RequireAgente } from "./auth/RequireAgente";
import { PublicRoute } from "./auth/PublicRoute";
import { ResenasPage } from "./pages/ResenasPage";
import { ResenaPublicaPage } from "./pages/ResenaPublicaPage";
import { ResenasPublicasPage } from "./pages/ResenasPublicasPage";

// Un platform admin no pertenece a ninguna organización (organizationId
// vacío en el AuthContext — ver src/services/auth.service.ts del backend),
// así que /clientes rompería para esa cuenta. "/" decide entre el panel de
// admin y la página de clientes según quién inició sesión.
function HomeRoute() {
  const { me } = useAuth();
  if (me?.isPlatformAdmin) {
    return <Navigate to="/admin/organizations" replace />;
  }
  return <ClientesPage />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Públicas, sin sesión: link de reseña que recibe el cliente final
            y listado de reseñas aprobadas de una organización. */}
        <Route element={<PublicRoute />}>
          <Route path="/r/:token" element={<ResenaPublicaPage />} />
          <Route path="/o/:slug/resenas" element={<ResenasPublicasPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/clientes/importar" element={<ImportClientesPage />} />
          <Route path="/admin/organizations" element={<AdminOrganizationsPage />} />
          <Route element={<RequireOrgAdmin />}>
            <Route path="/agente-whatsapp" element={<AgentConfigPage />} />
            <Route path="/usuarios" element={<UsersPage />} />
          </Route>
          <Route element={<RequireInboxAccess />}>
            <Route path="/inbox" element={<InboxPage />} />
          </Route>
          <Route element={<RequireAgente agentType="SEGUIMIENTO_RESENAS" />}>
            <Route path="/resenas" element={<ResenasPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
