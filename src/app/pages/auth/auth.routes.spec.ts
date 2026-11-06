import { Route } from '@angular/router';
import { AcceptInvitation, readInvitationToken } from './accept-invitation';
import routes from './auth.routes';
import { CompleteRegistration } from './complete-registration';
import { ForgotPassword } from './forgot-password';
import { Register } from './register';
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

describe('auth routes (spec 021)', () => {
    const find = (path: string): Route | undefined => (routes as Route[]).find((route) => route.path === path);

    it('serves the account creation pages', () => {
        expect(find('register')?.component).toBe(Register);
        expect(find('complete-registration')?.component).toBe(CompleteRegistration);
    });

    it('keeps them public: whoever creates an account has no session, so no guard can be on them', () => {
        expect(find('register')?.canActivate).toBeUndefined();
        expect(find('complete-registration')?.canActivate).toBeUndefined();
    });

    it('uses the path the API puts in the email link (EmailLinks.CompleteRegistration: /auth/complete-registration)', () => {
        // Si esta ruta cambia hay que cambiarla también en la API: el enlace del correo caería en la página de error. El prefijo /auth lo pone app.routes.
        expect(find('complete-registration')).toBeDefined();
        expect(find('complete-registration')?.path).toBe('complete-registration');
    });

    it('keeps the invitation page too (it also accepts the terms now)', () => {
        expect(find('accept-invitation')?.component).toBe(AcceptInvitation);
        expect(find('accept-invitation')?.canActivate).toBeUndefined();
    });
});

describe('readInvitationToken', () => {
    it('keeps reading the invitation token from the fragment', () => {
        expect(readInvitationToken('#token=abc-123')).toBe('abc-123');
        expect(readInvitationToken('')).toBeNull();
    });
});
