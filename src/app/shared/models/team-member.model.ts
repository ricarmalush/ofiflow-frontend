import { TenantRole } from './auth.model';

// Espejo TS de TenantUserDto (GET /users). Su id es el del TenantUser, el que espera
// POST /jobs/{id}/assign.
export interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: TenantRole;
    joinedAt: string;
    isCurrentUser: boolean;
}
