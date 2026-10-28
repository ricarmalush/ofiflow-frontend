// Los nombres de los permisos de OfiFlow.Domain.Tenancy.Permission (ADR-012), con el formato
// Entidad.Acción que escribe la API (PermissionNames).
//
// Ya NO hay aquí una copia de la tabla «qué puede hacer cada rol» (RolePermissions): quién tiene qué
// lo dice la API en GET /account/me (spec 012) y se guarda en CurrentSessionService. Esta lista solo
// existe para que el compilador avise si se escribe mal un permiso (can('Custmers.Read')).
//
// Siguen siendo para pintar la interfaz: esconder el botón "Eliminar" a quien no puede borrar. No
// protegen nada; la API vuelve a comprobar el permiso en cada petición y responde 403.
export type Permission =
    | 'Customers.Read'
    | 'Customers.Write'
    | 'Customers.Delete'
    | 'Jobs.Read'
    | 'Jobs.Write'
    | 'Jobs.Assign'
    | 'Jobs.Cancel'
    | 'Jobs.Execute'
    | 'Users.Read'
    | 'Users.Manage'
    | 'Mfa.Manage'
    | 'Account.Read'
    | 'Account.CloseSessions';
