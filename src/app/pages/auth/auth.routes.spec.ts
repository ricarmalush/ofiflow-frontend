import { Route } from '@angular/router';
import { readInvitationToken } from './accept-invitation';
import routes from './auth.routes';
import { ForgotPassword } from './forgot-password';
import { ResetPassword } from './reset-password';

describe('auth routes (spec 018)', () => {
    const find = (path: string): Route | undefined => (routes as Route[]).find((route) => route.path === path);

    it('serves the recovery pages', () => {
        expect(find('forgot-password')?.component).toBe(ForgotPassword);
        expect(find('reset-password')?.component).toBe(ResetPassword);
    });

    it('keeps them public: whoever forgot the password has no session, so no guard can be on them', () => {
        expect(find('forgot-password')?.canActivate).toBeUndefined();
        expect(find('reset-password')?.canActivate).toBeUndefined();
    });

    it('uses the path the API puts in the email link (EmailLinks: /auth/reset-password)', () => {
        // Si esta ruta cambia hay que cambiarla también en la API: el enlace del correo caería en la página de error.
        expect(find('reset-password')).toBeDefined();
    });
});

describe('readInvitationToken', () => {
    it('keeps reading the invitation token from the fragment', () => {
        expect(readInvitationToken('#token=abc-123')).toBe('abc-123');
        expect(readInvitationToken('')).toBeNull();
    });
});
