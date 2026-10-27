import { TenantRole } from './auth.model';

// Espejo TS de CurrentAccountDto (GET /account/me, spec 012): quién soy, en qué empresa estoy y
// qué puedo hacer, según la API AHORA (no según lo que dijo el token al emitirse).
export interface CurrentAccount {
    userId: string;
    // El Id de MI pertenencia a la empresa (TenantUser): es el que lleva Job.assignedTenantUserId. El
    // sub del token es el Id de la cuenta, otro distinto; con este un técnico sabe cuáles son sus trabajos.
    membershipId: string;
    name: string;
    email: string;
    tenantId: string;
    tenantName: string;
    // El rol EFECTIVO (el de la base de datos): si un gestor lo cambió después de emitirse el token, ya viene el nuevo.
    role: TenantRole;
    // Nombres estables de la API (Customers.Read...). Son para pintar la interfaz: quien decide es siempre la API.
    permissions: string[];
}
