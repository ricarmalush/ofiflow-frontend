// Espejo TS de los DTOs de OfiFlow.Application.Identity.Mfa.

// GET /account/mfa. Nunca trae secretos.
export interface MfaStatus {
    enabled: boolean;
    // Se pidió el secreto (/setup) pero aún no se confirmó con un código (/enable).
    setupPending: boolean;
    recoveryCodesRemaining: number;
}

// POST /account/mfa/setup. El secreto y la URI otpauth:// llegan UNA sola vez.
export interface MfaSetup {
    secret: string;
    otpAuthUri: string;
}

// POST /account/mfa/enable y /recovery-codes. Los códigos llegan UNA sola vez.
export interface RecoveryCodes {
    codes: string[];
}
