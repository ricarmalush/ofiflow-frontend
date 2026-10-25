// Espejo TS de AuthResultDto: la sesión que devuelven /auth/login (sin segundo factor),
// /auth/mfa/verify y /auth/refresh.
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
}

// Espejo TS de TenantRole (OfiFlow.Domain.Tenancy). Viaja en el claim "role" del JWT.
export type TenantRole = 'Owner' | 'Admin' | 'Manager' | 'Technician' | 'Employee';
