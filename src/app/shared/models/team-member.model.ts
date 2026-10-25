import { TenantRole } from './auth.model';

// Espejo TS de TenantUserDto (GET /users). Su id es el de la pertenencia (TenantUser), el que
// esperan /users/{id}/role, DELETE /users/{id} y POST /jobs/{id}/assign; no el de la cuenta.
export interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: TenantRole;
    joinedAt: string;
    isCurrentUser: boolean;
}

// Espejo TS de InvitationDto: una invitación pendiente. Nunca trae el token.
export interface Invitation {
    id: string;
    email: string;
    role: TenantRole;
    expiresAt: string;
    createdAt: string;
}

// Espejo TS de InvitationCreatedDto. El token llega en claro UNA sola vez, al crearla.
export interface InvitationCreated {
    id: string;
    token: string;
    expiresAt: string;
}

export const ROLE_LABELS: Readonly<Record<TenantRole, string>> = {
    Owner: 'Propietario',
    Admin: 'Administrador',
    Manager: 'Responsable',
    Technician: 'Técnico',
    Employee: 'Oficina'
};

// La API lee TenantRole como número (orden del enum en OfiFlow.Domain.Tenancy.TenantRole).
export const TENANT_ROLE_WIRE: Readonly<Record<TenantRole, number>> = { Owner: 0, Admin: 1, Manager: 2, Technician: 3, Employee: 4 };

// Espejo TS de ManageableRoles (ADR-013): a qué roles puede conceder, cambiar y quitar cada rol.
// Como la tabla de permisos, es solo para la interfaz; la API aplica la suya en cada petición.
// Nadie gestiona al Owner, y un Admin no gestiona a otros Admin.
export const MANAGEABLE_ROLES: Readonly<Record<TenantRole, readonly TenantRole[]>> = {
    Owner: ['Admin', 'Manager', 'Technician', 'Employee'],
    Admin: ['Manager', 'Technician', 'Employee'],
    Manager: [],
    Technician: [],
    Employee: []
};

export function canManage(actor: TenantRole | null, target: TenantRole): boolean {
    return !!actor && (MANAGEABLE_ROLES[actor] ?? []).includes(target);
}
