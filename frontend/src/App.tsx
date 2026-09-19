import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { ClientesPage } from "./pages/ClientesPage";
import { ImportClientesPage } from "./pages/ImportClientesPage";
import { AdminOrganizationsPage } from "./pages/AdminOrganizationsPage";

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
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/clientes/importar" element={<ImportClientesPage />} />
          <Route path="/admin/organizations" element={<AdminOrganizationsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
