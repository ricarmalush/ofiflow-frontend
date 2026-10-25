import { TenantRole } from './auth.model';

// Espejo TS de Permission y RolePermissions (OfiFlow.Domain.Tenancy, ADR-012).
//
// Es una COPIA para pintar la interfaz: esconder el botón "Eliminar" a quien no puede borrar.
// No protege nada; la API vuelve a comprobar el permiso en cada petición y responde 403. Si las
// dos tablas se desincronizan, lo peor que pasa es un botón de más (que da 403) o de menos.
// Mejor a futuro: que la API exponga los permisos (en el token o en un /me) y quitar esta copia.
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
    | 'Mfa.Manage';

const OWNER_AND_ADMIN: readonly Permission[] = [
    'Customers.Read',
    'Customers.Write',
    'Customers.Delete',
    'Jobs.Read',
    'Jobs.Write',
    'Jobs.Assign',
    'Jobs.Cancel',
    'Jobs.Execute',
    'Users.Read',
    'Users.Manage',
    'Mfa.Manage'
];

export const ROLE_PERMISSIONS: Readonly<Record<TenantRole, readonly Permission[]>> = {
    Owner: OWNER_AND_ADMIN,
    Admin: OWNER_AND_ADMIN,
    Manager: ['Customers.Read', 'Customers.Write', 'Jobs.Read', 'Jobs.Write', 'Jobs.Assign', 'Jobs.Cancel', 'Jobs.Execute', 'Users.Read', 'Mfa.Manage'],
    Employee: ['Customers.Read', 'Customers.Write', 'Jobs.Read', 'Jobs.Write', 'Mfa.Manage'],
    Technician: ['Customers.Read', 'Jobs.Read', 'Jobs.Execute', 'Mfa.Manage']
};
