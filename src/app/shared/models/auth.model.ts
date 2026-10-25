// Espejo TS de AuthResultDto: la sesión que devuelven /auth/login (sin segundo factor),
// /auth/mfa/verify y /auth/refresh.
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
}

// Respuesta de /auth/login cuando la cuenta tiene segundo factor: no hay sesión todavía, hay un
// desafío que se canjea con un código en /auth/mfa/verify antes de expiresAt.
export interface MfaChallenge {
    mfaRequired: true;
    challenge: string;
    expiresAt: string;
}

// Lo que el AuthService devuelve a la pantalla de login, con los tres casos explícitos.
export type LoginOutcome = { kind: 'authenticated' } | { kind: 'mfa-required'; challenge: string; expiresAt: string } | { kind: 'failed'; message: string };

// Espejo TS de TenantRole (OfiFlow.Domain.Tenancy). Viaja en el claim "role" del JWT.
export type TenantRole = 'Owner' | 'Admin' | 'Manager' | 'Technician' | 'Employee';
