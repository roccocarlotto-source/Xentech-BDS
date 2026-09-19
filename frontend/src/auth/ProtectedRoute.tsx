import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute() {
  const { status, profileError, retryProfile } = useAuth();
  const location = useLocation();

  if (status === "initializing" || status === "loading-profile") {
    return <div className="page-message">Cargando…</div>;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (status === "profile-error") {
    return (
      <div className="page-message">
        <p>No pudimos verificar tu cuenta{profileError ? `: ${profileError.message}` : "."}</p>
        <button type="button" onClick={retryProfile}>
          Reintentar
        </button>
      </div>
    );
  }

  return <Outlet />;
}
