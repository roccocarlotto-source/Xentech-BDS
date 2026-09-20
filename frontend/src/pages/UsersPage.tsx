import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { request } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import { useAuth } from "../auth/AuthContext";
import type { OrgUser } from "../types/orgUser";

const USERS_QUERY_KEY = ["users"] as const;

// Fase 5, paso 4: acá el admin de la organización otorga o retira el
// permiso de inbox (User.canHandleInbox) a sus propios usuarios --
// decisión de Rocco: un permiso puntual, no un rol nuevo, y el admin
// siempre tiene acceso al inbox sin necesitar el flag.
export function UsersPage() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: ({ signal }) => request<OrgUser[]>("/users", { getAccessToken, signal }),
  });

  const permissionsMutation = useMutation({
    mutationFn: ({ userId, canHandleInbox }: { userId: string; canHandleInbox: boolean }) =>
      request<OrgUser>(`/users/${userId}/permissions`, {
        method: "PATCH",
        body: { canHandleInbox },
        getAccessToken,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Usuarios</h1>
        <div className="agent-config-header-actions">
          <Link to="/">Volver a clientes</Link>
          <button type="button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <p className="agent-config-hint">
        El admin de la organización siempre puede ver y responder el inbox de conversaciones
        derivadas. Tildá acá a quién más le das ese acceso.
      </p>

      {usersQuery.isLoading && <p className="page-message">Cargando usuarios…</p>}
      {usersQuery.isError && <p className="page-message">No se pudieron cargar los usuarios.</p>}

      {usersQuery.data && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Puede atender el inbox</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.data.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.role === "ADMIN" ? "Admin" : "Miembro"}</td>
                <td>
                  <label className="admin-toggle">
                    <input
                      type="checkbox"
                      checked={user.role === "ADMIN" ? true : user.canHandleInbox}
                      disabled={user.role === "ADMIN" || permissionsMutation.isPending}
                      onChange={(e) =>
                        permissionsMutation.mutate({
                          userId: user.id,
                          canHandleInbox: e.target.checked,
                        })
                      }
                    />
                    <span className="sr-only">Permiso de inbox para {user.email}</span>
                  </label>
                </td>
              </tr>
            ))}
            {usersQuery.data.length === 0 && (
              <tr>
                <td colSpan={3} className="page-message">
                  Todavía no hay usuarios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
