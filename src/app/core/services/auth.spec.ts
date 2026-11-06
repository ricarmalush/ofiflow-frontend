import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LoginOutcome } from '../../shared/models/auth.model';
import { OperationResult } from '../../shared/models/result.model';
import { buildAccount } from '../testing/fake-account';
import { buildSessionToken } from '../testing/fake-jwt';
import { AuthService, INVALID_CREDENTIALS_MESSAGE, INVALID_MFA_CODE_MESSAGE } from './auth';
import { CurrentSessionService } from './current-session';

describe('AuthService', () => {
    let service: AuthService;
    let httpMock: HttpTestingController;
    const authUrl = `${environment.apiUrl}/auth`;
    const accountUrl = `${environment.apiUrl}/account/me`;
    const tokens = { accessToken: buildSessionToken(), refreshToken: 'refresh-1', expiresAt: '2030-01-01T00:00:00Z' };

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(AuthService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

    describe('login', () => {
        it('stores the session when the account has no second factor', () => {
            let outcome: LoginOutcome | undefined;
            service.login('ana@empresa.com', 'secret').subscribe((o) => (outcome = o));

            const req = httpMock.expectOne(`${authUrl}/login`);
            expect(req.request.body).toEqual({ email: 'ana@empresa.com', password: 'secret' });
            req.flush(tokens);

            expect(outcome).toEqual({ kind: 'authenticated' });
            expect(service.getToken()).toBe(tokens.accessToken);
            expect(TestBed.inject(CurrentSessionService).session()?.tokenRole).toBe('Owner');
        });

        it('returns the challenge and stores nothing when a second factor is required', () => {
            let outcome: LoginOutcome | undefined;
            service.login('ana@empresa.com', 'secret').subscribe((o) => (outcome = o));

            httpMock.expectOne(`${authUrl}/login`).flush({ mfaRequired: true, challenge: 'ch-1', expiresAt: '2030-01-01T00:05:00Z' });

            expect(outcome).toEqual({ kind: 'mfa-required', challenge: 'ch-1', expiresAt: '2030-01-01T00:05:00Z' });
            expect(service.getToken()).toBeNull();
        });

        it('gives one message for every rejected login, without saying why', () => {
            let outcome: LoginOutcome | undefined;
            service.login('ana@empresa.com', 'wrong').subscribe((o) => (outcome = o));

            httpMock.expectOne(`${authUrl}/login`).flush(null, { status: 401, statusText: 'Unauthorized' });

            expect(outcome).toEqual({ kind: 'failed', message: INVALID_CREDENTIALS_MESSAGE });
        });

        it('shows the API text when the login is rate limited', () => {
            let outcome: LoginOutcome | undefined;
            service.login('ana@empresa.com', 'secret').subscribe((o) => (outcome = o));

            httpMock.expectOne(`${authUrl}/login`).flush({ status: 429, detail: 'Demasiados intentos.', code: 'RateLimit.Exceeded' }, { status: 429, statusText: 'Too Many Requests' });

            expect(outcome).toEqual({ kind: 'failed', message: 'Demasiados intentos.' });
        });
    });

    describe('verifyMfa', () => {
        it('stores the session when the code is accepted', () => {
            let result: OperationResult | undefined;
            service.verifyMfa('ch-1', '123456').subscribe((r) => (result = r));

            const req = httpMock.expectOne(`${authUrl}/mfa/verify`);
            expect(req.request.body).toEqual({ challenge: 'ch-1', code: '123456' });
            req.flush(tokens);

            expect(result?.isSuccess).toBeTrue();
            expect(service.getRefreshToken()).toBe('refresh-1');
        });

        it('fails with a neutral message when the code is rejected', () => {
            let result: OperationResult | undefined;
            service.verifyMfa('ch-1', '000000').subscribe((r) => (result = r));

            httpMock.expectOne(`${authUrl}/mfa/verify`).flush(null, { status: 401, statusText: 'Unauthorized' });

            expect(result).toEqual({ isSuccess: false, message: INVALID_MFA_CODE_MESSAGE });
            expect(service.getToken()).toBeNull();
        });
    });

    describe('refresh', () => {
        beforeEach(() => service.storeSession(tokens));

        it('swaps the refresh token for a new pair', () => {
            let refreshed: boolean | undefined;
            service.refresh().subscribe((r) => (refreshed = r));

            const req = httpMock.expectOne(`${authUrl}/refresh`);
            expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
            req.flush({ ...tokens, refreshToken: 'refresh-2' });
            httpMock.expectOne(accountUrl).flush(buildAccount()); // renovar la sesión también vuelve a preguntar quién soy

            expect(refreshed).toBeTrue();
            expect(service.getRefreshToken()).toBe('refresh-2');
        });

        it('sends a single request when several callers refresh at once (the API revokes a reused token)', () => {
            const results: boolean[] = [];
            service.refresh().subscribe((r) => results.push(r));
            service.refresh().subscribe((r) => results.push(r));

            httpMock.expectOne(`${authUrl}/refresh`).flush({ ...tokens, refreshToken: 'refresh-2' });
            httpMock.expectOne(accountUrl).flush(buildAccount());

            expect(results).toEqual([true, true]);
        });

        it('asks again who I am when the session is renewed: if a manager changed my role meanwhile, the new one is picked up', () => {
            const session = TestBed.inject(CurrentSessionService);
            session.setAccount(buildAccount({ role: 'Technician' }));
            service.refresh().subscribe();

            httpMock.expectOne(`${authUrl}/refresh`).flush({ ...tokens, refreshToken: 'refresh-2' });
            httpMock.expectOne(accountUrl).flush(buildAccount({ role: 'Manager' }));

            expect(session.role()).toBe('Manager');
            expect(session.can('Jobs.Assign')).toBeTrue();
        });

        it('does not ask for the account when the refresh is rejected', () => {
            service.refresh().subscribe();

            httpMock.expectOne(`${authUrl}/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

            httpMock.expectNone(accountUrl);
        });

        it('clears the session when the API rejects the refresh token', () => {
            let refreshed: boolean | undefined;
            service.refresh().subscribe((r) => (refreshed = r));

            httpMock.expectOne(`${authUrl}/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

            expect(refreshed).toBeFalse();
            expect(service.getToken()).toBeNull();
            expect(service.getRefreshToken()).toBeNull();
        });
    });

    describe('company suspended (spec 011)', () => {
        it('shows the API message when the login of a suspended company answers 403 (the credentials were right, so this is not a wrong password)', () => {
            const message = 'La empresa está suspendida. Ponte en contacto con el soporte de OfiFlow.';
            let outcome: LoginOutcome | undefined;
            service.login('ana@empresa.com', 'secret').subscribe((o) => (outcome = o));

            httpMock.expectOne(`${authUrl}/login`).flush({ code: 'tenant.suspended', detail: message }, { status: 403, statusText: 'Forbidden' });

            expect(outcome).toEqual({ kind: 'failed', message });
            expect(service.getToken()).toBeNull();
        });
    });

    describe('logout', () => {
        it('clears the session and carries the notice with its severity in the navigation state, not in the URL', () => {
            const router = TestBed.inject(Router);
            const navigate = spyOn(router, 'navigate').and.resolveTo(true);
            service.storeSession(tokens);

            service.logout('Tu empresa está suspendida.', 'warn');
            httpMock.expectOne(`${authUrl}/logout`).flush(null, { status: 204, statusText: 'No Content' });

            expect(service.getToken()).toBeNull();
            expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], { state: { info: 'Tu empresa está suspendida.', infoSeverity: 'warn' } });
        });

        describe('tells the server (spec 013)', () => {
            beforeEach(() => spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true));

            it('sends the refresh token to POST /auth/logout', () => {
                service.storeSession(tokens);

                service.logout();

                const request = httpMock.expectOne(`${authUrl}/logout`);
                expect(request.request.method).toBe('POST');
                expect(request.request.body).toEqual({ refreshToken: 'refresh-1' });
                request.flush(null, { status: 204, statusText: 'No Content' });
            });

            it('clears everything locally BEFORE the server answers (it does not wait)', () => {
                service.storeSession(tokens);
                const session = TestBed.inject(CurrentSessionService);

                service.logout();

                // La petición sigue sin responder y la sesión local ya no existe.
                expect(service.getToken()).toBeNull();
                expect(service.getRefreshToken()).toBeNull();
                expect(session.session()).toBeNull();
                httpMock.expectOne(`${authUrl}/logout`);
            });

            it('still clears the session and navigates when there is no network', () => {
                const navigate = TestBed.inject(Router).navigate as jasmine.Spy;
                service.storeSession(tokens);

                service.logout();
                httpMock.expectOne(`${authUrl}/logout`).error(new ProgressEvent('error'));

                expect(service.getToken()).toBeNull();
                expect(service.getRefreshToken()).toBeNull();
                expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], undefined);
            });

            it('still clears the session when the server answers an error', () => {
                service.storeSession(tokens);

                service.logout();
                httpMock.expectOne(`${authUrl}/logout`).flush({ code: 'server.unexpected' }, { status: 500, statusText: 'Server Error' });

                expect(service.getToken()).toBeNull();
                expect(service.getRefreshToken()).toBeNull();
            });

            it('does not retry when the call fails', () => {
                service.storeSession(tokens);

                service.logout();
                httpMock.expectOne(`${authUrl}/logout`).error(new ProgressEvent('error'));

                httpMock.expectNone(`${authUrl}/logout`);
            });

            it('makes no call when there is no refresh token (the session was already closed)', () => {
                service.logout();

                httpMock.expectNone(`${authUrl}/logout`);
            });

            it('after a rejected refresh the session is already gone, so the forced logout makes no call', () => {
                service.storeSession(tokens);
                service.refresh().subscribe();
                httpMock.expectOne(`${authUrl}/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

                service.logout();

                httpMock.expectNone(`${authUrl}/logout`);
            });

            it('a second logout right after the first does not send the token again', () => {
                service.storeSession(tokens);

                service.logout();
                service.logout();

                httpMock.expectOne(`${authUrl}/logout`);
            });
        });

        it('keeps the navigation state of a normal notice exactly as it was (no severity travels)', () => {
            const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

            service.logout('Se cerraron tus sesiones.');

            expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], { state: { info: 'Se cerraron tus sesiones.' } });
        });

        it('navigates without state when there is no notice', () => {
            const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

            service.logout();

            expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], undefined);
        });
    });

    describe('closeAllSessions (spec 014)', () => {
        const sessionsUrl = `${environment.apiUrl}/account/sessions`;
        let navigate: jasmine.Spy;
        let result: OperationResult | undefined;

        beforeEach(() => {
            navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
            result = undefined;
            service.storeSession(tokens);
        });

        it('sends DELETE /account/sessions with no body (the account comes from the token)', () => {
            service.closeAllSessions().subscribe();

            const request = httpMock.expectOne(sessionsUrl);
            expect(request.request.method).toBe('DELETE');
            expect(request.request.body).toBeNull();
            request.flush(null, { status: 204, statusText: 'No Content' });
        });

        it('on success clears the local session and goes to the login with the notice', () => {
            const session = TestBed.inject(CurrentSessionService);

            service.closeAllSessions().subscribe((r) => (result = r));
            httpMock.expectOne(sessionsUrl).flush(null, { status: 204, statusText: 'No Content' });

            expect(result?.isSuccess).toBeTrue();
            expect(service.getToken()).toBeNull();
            expect(service.getRefreshToken()).toBeNull();
            expect(session.session()).toBeNull();
            expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], { state: { info: 'Se cerraron todas tus sesiones. Vuelve a entrar.' } });
        });

        it('does NOT touch the local session until the server confirms (unlike logout)', () => {
            service.closeAllSessions().subscribe();

            expect(service.getToken()).toBe(tokens.accessToken);
            expect(service.getRefreshToken()).toBe('refresh-1');
            expect(navigate).not.toHaveBeenCalled();
            httpMock.expectOne(sessionsUrl);
        });

        it('does not also call POST /auth/logout: the same request already revoked this tab\'s refresh token', () => {
            service.closeAllSessions().subscribe();
            httpMock.expectOne(sessionsUrl).flush(null, { status: 204, statusText: 'No Content' });

            httpMock.expectNone(`${authUrl}/logout`);
        });

        it('on a server error keeps the session and reports the error', () => {
            service.closeAllSessions().subscribe((r) => (result = r));
            httpMock.expectOne(sessionsUrl).flush({ code: 'server.unexpected' }, { status: 500, statusText: 'Server Error' });

            expect(result?.isSuccess).toBeFalse();
            expect(result?.message).toBeTruthy();
            expect(service.getToken()).toBe(tokens.accessToken);
            expect(service.getRefreshToken()).toBe('refresh-1');
            expect(navigate).not.toHaveBeenCalled();
        });

        it('with no network keeps the session (saying "all closed" would be false) and reports it', () => {
            service.closeAllSessions().subscribe((r) => (result = r));
            httpMock.expectOne(sessionsUrl).error(new ProgressEvent('error'));

            expect(result?.isSuccess).toBeFalse();
            expect(service.getToken()).toBe(tokens.accessToken);
            expect(navigate).not.toHaveBeenCalled();
        });

        it('shows the API text when the rate limit answers 429, and keeps the session', () => {
            service.closeAllSessions().subscribe((r) => (result = r));
            httpMock.expectOne(sessionsUrl).flush({ detail: 'Demasiadas peticiones.' }, { status: 429, statusText: 'Too Many Requests' });

            expect(result).toEqual(jasmine.objectContaining({ isSuccess: false, message: 'Demasiadas peticiones.' }));
            expect(service.getToken()).toBe(tokens.accessToken);
        });

        it('does not retry when it fails', () => {
            service.closeAllSessions().subscribe();
            httpMock.expectOne(sessionsUrl).error(new ProgressEvent('error'));

            httpMock.expectNone(sessionsUrl);
        });
    });

    describe('closeSession (spec 016)', () => {
        const sessionId = '4d6f1f6a-8c1e-4f3b-9d6a-2b1c3d4e5f60';
        const sessionUrl = `${environment.apiUrl}/account/sessions/${sessionId}`;
        let navigate: jasmine.Spy;
        let result: OperationResult | undefined;

        beforeEach(() => {
            navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
            result = undefined;
            service.storeSession(tokens);
        });

        it('sends DELETE /account/sessions/{id} with no body (the account comes from the token)', () => {
            service.closeSession(sessionId, false).subscribe();

            const request = httpMock.expectOne(sessionUrl);
            expect(request.request.method).toBe('DELETE');
            expect(request.request.body).toBeNull();
            request.flush(null, { status: 204, statusText: 'No Content' });
        });

        it('encodes the id so it can never add path segments or a query to the URL', () => {
            service.closeSession('../me?x=1', false).subscribe();

            const request = httpMock.expectOne((r) => r.method === 'DELETE');
            expect(request.request.url).toBe(`${environment.apiUrl}/account/sessions/..%2Fme%3Fx%3D1`);
            request.flush(null, { status: 204, statusText: 'No Content' });
        });

        it('closing ANOTHER session keeps this one exactly as it was', () => {
            service.closeSession(sessionId, false).subscribe((r) => (result = r));
            httpMock.expectOne(sessionUrl).flush(null, { status: 204, statusText: 'No Content' });

            expect(result?.isSuccess).toBeTrue();
            expect(service.getToken()).toBe(tokens.accessToken);
            expect(service.getRefreshToken()).toBe('refresh-1');
            expect(navigate).not.toHaveBeenCalled();
        });

        it('closing THIS session clears the local one and goes to the login with the notice', () => {
            const session = TestBed.inject(CurrentSessionService);

            service.closeSession(sessionId, true).subscribe((r) => (result = r));
            httpMock.expectOne(sessionUrl).flush(null, { status: 204, statusText: 'No Content' });

            expect(result?.isSuccess).toBeTrue();
            expect(service.getToken()).toBeNull();
            expect(service.getRefreshToken()).toBeNull();
            expect(session.session()).toBeNull();
            expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], { state: { info: 'Se cerró esta sesión. Vuelve a entrar.' } });
        });

        it('does not touch the local session until the server confirms', () => {
            service.closeSession(sessionId, true).subscribe();

            expect(service.getToken()).toBe(tokens.accessToken);
            expect(navigate).not.toHaveBeenCalled();
            httpMock.expectOne(sessionUrl);
        });

        it('does not also call POST /auth/logout: the same request already revoked this tab\'s refresh token', () => {
            service.closeSession(sessionId, true).subscribe();
            httpMock.expectOne(sessionUrl).flush(null, { status: 204, statusText: 'No Content' });

            httpMock.expectNone(`${authUrl}/logout`);
        });

        it('on the 404 (not found, not yours or already closed: the API does not say which) keeps the session even if it was "this" one', () => {
            service.closeSession(sessionId, true).subscribe((r) => (result = r));
            httpMock.expectOne(sessionUrl).flush({ code: 'session.not_found', detail: 'No se ha encontrado la sesión.' }, { status: 404, statusText: 'Not Found' });

            expect(result).toEqual(jasmine.objectContaining({ isSuccess: false, message: 'No se ha encontrado la sesión.', code: 'session.not_found' }));
            expect(service.getToken()).toBe(tokens.accessToken);
            expect(navigate).not.toHaveBeenCalled();
        });

        it('with no network keeps the session and reports it', () => {
            service.closeSession(sessionId, true).subscribe((r) => (result = r));
            httpMock.expectOne(sessionUrl).error(new ProgressEvent('error'));

            expect(result?.isSuccess).toBeFalse();
            expect(service.getToken()).toBe(tokens.accessToken);
            expect(navigate).not.toHaveBeenCalled();
        });

        it('shows the API text when the rate limit answers 429', () => {
            service.closeSession(sessionId, false).subscribe((r) => (result = r));
            httpMock.expectOne(sessionUrl).flush({ detail: 'Demasiadas peticiones.' }, { status: 429, statusText: 'Too Many Requests' });

            expect(result).toEqual(jasmine.objectContaining({ isSuccess: false, message: 'Demasiadas peticiones.' }));
        });
    });

    describe('forgotPassword (spec 018)', () => {
        let result: OperationResult | undefined;

        beforeEach(() => (result = undefined));

        it('sends POST /auth/forgot-password with only the email, and no session', () => {
            service.forgotPassword('ana@empresa.com').subscribe((r) => (result = r));

            const request = httpMock.expectOne(`${authUrl}/forgot-password`);
            expect(request.request.method).toBe('POST');
            expect(request.request.body).toEqual({ email: 'ana@empresa.com' });
            request.flush(null, { status: 202, statusText: 'Accepted' });

            expect(result?.isSuccess).toBeTrue();
            expect(service.getToken()).toBeNull();
        });

        it('turns a malformed-email 400 into a failure with the API text', () => {
            service.forgotPassword('sin-arroba').subscribe((r) => (result = r));

            httpMock
                .expectOne(`${authUrl}/forgot-password`)
                .flush({ code: 'validation.failed', detail: 'El email no es válido.' }, { status: 400, statusText: 'Bad Request' });

            expect(result).toEqual(jasmine.objectContaining({ isSuccess: false, message: 'El email no es válido.', code: 'validation.failed' }));
        });

        it('turns the IP rate limit into a failure', () => {
            service.forgotPassword('ana@empresa.com').subscribe((r) => (result = r));

            httpMock
                .expectOne(`${authUrl}/forgot-password`)
                .flush({ code: 'rate_limit.exceeded', detail: 'Demasiadas peticiones.' }, { status: 429, statusText: 'Too Many Requests' });

            expect(result).toEqual(jasmine.objectContaining({ isSuccess: false, message: 'Demasiadas peticiones.' }));
        });
    });

    describe('resetPassword (spec 018)', () => {
        let result: OperationResult | undefined;

        beforeEach(() => (result = undefined));

        it('sends POST /auth/reset-password with the token and the new password, and opens no session', () => {
            service.resetPassword('tok-1', 'Clave-nueva-2026!').subscribe((r) => (result = r));

            const request = httpMock.expectOne(`${authUrl}/reset-password`);
            expect(request.request.method).toBe('POST');
            expect(request.request.body).toEqual({ token: 'tok-1', newPassword: 'Clave-nueva-2026!' });
            request.flush(null, { status: 204, statusText: 'No Content' });

            expect(result?.isSuccess).toBeTrue();
            // La API no devuelve sesión: se entra por el login normal.
            expect(service.getToken()).toBeNull();
            expect(service.getRefreshToken()).toBeNull();
        });

        it('keeps the stable code of a token that does not serve, so the page can tell it apart', () => {
            service.resetPassword('tok-1', 'Clave-nueva-2026!').subscribe((r) => (result = r));

            httpMock
                .expectOne(`${authUrl}/reset-password`)
                .flush({ code: 'password_reset.invalid', detail: 'El enlace no es válido.' }, { status: 400, statusText: 'Bad Request' });

            expect(result).toEqual(jasmine.objectContaining({ isSuccess: false, message: 'El enlace no es válido.', code: 'password_reset.invalid' }));
        });

        it('keeps the field errors of a validation failure', () => {
            service.resetPassword('tok-1', 'corta').subscribe((r) => (result = r));

            httpMock.expectOne(`${authUrl}/reset-password`).flush(
                { code: 'validation.failed', detail: 'Hay datos no válidos.', errors: [{ field: 'newPassword', code: 'length', message: 'Entre 8 y 128.' }] },
                { status: 400, statusText: 'Bad Request' }
            );

            expect(result?.fieldErrors?.[0].field).toBe('newPassword');
        });

        it('does not touch an existing session', () => {
            service.storeSession(tokens);

            service.resetPassword('tok-1', 'Clave-nueva-2026!').subscribe();
            httpMock.expectOne(`${authUrl}/reset-password`).flush(null, { status: 204, statusText: 'No Content' });

            // El restablecimiento es de una cuenta anónima; si esta pestaña tenía sesión, la limpia el 401 del interceptor cuando el servidor la cierre, no este método.
            expect(service.getToken()).toBe(tokens.accessToken);
        });
    });

    describe('requestRegistration (spec 021)', () => {
        const request = { companyName: 'Fontanería Demo SL', userName: 'Ana Pérez', email: 'ana@empresa.com', acceptedTermsVersion: '2026-11' };
        let result: OperationResult | undefined;

        beforeEach(() => (result = undefined));

        it('sends POST /auth/registration with the four fields and NO password, and opens no session', () => {
            service.requestRegistration(request).subscribe((r) => (result = r));

            const req = httpMock.expectOne(`${authUrl}/registration`);
            expect(req.request.method).toBe('POST');
            expect(req.request.body).toEqual(request);
            expect(Object.keys(req.request.body as object).sort()).toEqual(['acceptedTermsVersion', 'companyName', 'email', 'userName']);
            req.flush(null, { status: 202, statusText: 'Accepted' });

            expect(result?.isSuccess).toBeTrue();
            // La API no abre sesión ni crea ninguna cuenta: se entra por el login normal, después de abrir el enlace del correo.
            expect(service.getToken()).toBeNull();
            expect(service.getRefreshToken()).toBeNull();
        });

        it('keeps the field errors of a 400 (for example the terms version that is no longer the current one)', () => {
            service.requestRegistration({ ...request, acceptedTermsVersion: '2020-01' }).subscribe((r) => (result = r));

            httpMock.expectOne(`${authUrl}/registration`).flush(
                { code: 'validation.failed', detail: 'Hay datos no válidos.', errors: [{ field: 'AcceptedTermsVersion', code: 'registration.terms_not_accepted', message: 'Hay que aceptar las condiciones vigentes.' }] },
                { status: 400, statusText: 'Bad Request' }
            );

            expect(result?.isSuccess).toBeFalse();
            expect(result?.fieldErrors?.[0]).toEqual(jasmine.objectContaining({ field: 'AcceptedTermsVersion', code: 'registration.terms_not_accepted' }));
        });

        it('turns the IP rate limit into a failure', () => {
            service.requestRegistration(request).subscribe((r) => (result = r));

            httpMock.expectOne(`${authUrl}/registration`).flush({ code: 'rate_limit.exceeded', detail: 'Demasiadas peticiones.' }, { status: 429, statusText: 'Too Many Requests' });

            expect(result).toEqual(jasmine.objectContaining({ isSuccess: false, message: 'Demasiadas peticiones.', code: 'rate_limit.exceeded' }));
        });

        it('does not touch an existing session', () => {
            service.storeSession(tokens);

            service.requestRegistration(request).subscribe();
            httpMock.expectOne(`${authUrl}/registration`).flush(null, { status: 202, statusText: 'Accepted' });

            expect(service.getToken()).toBe(tokens.accessToken);
        });
    });

    describe('completeRegistration (spec 021)', () => {
        let result: OperationResult | undefined;

        beforeEach(() => (result = undefined));

        it('sends POST /auth/registration/complete with the token and the password, and opens no session', () => {
            service.completeRegistration('tok-1', 'Clave-elegida-2026!').subscribe((r) => (result = r));

            const req = httpMock.expectOne(`${authUrl}/registration/complete`);
            expect(req.request.method).toBe('POST');
            expect(req.request.body).toEqual({ token: 'tok-1', newPassword: 'Clave-elegida-2026!' });
            req.flush(null, { status: 204, statusText: 'No Content' });

            expect(result?.isSuccess).toBeTrue();
            // La cuenta nace aquí, pero la API no devuelve sesión: se entra por el login normal.
            expect(service.getToken()).toBeNull();
            expect(service.getRefreshToken()).toBeNull();
        });

        it('keeps the stable code of a link that does not serve, so the page can tell it apart', () => {
            service.completeRegistration('tok-1', 'Clave-elegida-2026!').subscribe((r) => (result = r));

            httpMock.expectOne(`${authUrl}/registration/complete`).flush({ code: 'registration.invalid', detail: 'El enlace no es válido.' }, { status: 400, statusText: 'Bad Request' });

            expect(result).toEqual(jasmine.objectContaining({ isSuccess: false, message: 'El enlace no es válido.', code: 'registration.invalid' }));
        });

        it('keeps the field errors of a validation failure', () => {
            service.completeRegistration('tok-1', 'corta').subscribe((r) => (result = r));

            httpMock.expectOne(`${authUrl}/registration/complete`).flush(
                { code: 'validation.failed', detail: 'Hay datos no válidos.', errors: [{ field: 'NewPassword', code: 'length', message: 'Entre 8 y 128.' }] },
                { status: 400, statusText: 'Bad Request' }
            );

            expect(result?.fieldErrors?.[0].field).toBe('NewPassword');
        });

        it('does not touch an existing session', () => {
            service.storeSession(tokens);

            service.completeRegistration('tok-1', 'Clave-elegida-2026!').subscribe();
            httpMock.expectOne(`${authUrl}/registration/complete`).flush(null, { status: 204, statusText: 'No Content' });

            expect(service.getToken()).toBe(tokens.accessToken);
        });
    });

    describe('acceptInvitation (spec 021 D8)', () => {
        it('sends the terms version the person accepted, together with the name and the password', () => {
            let result: OperationResult | undefined;
            service.acceptInvitation('tok-1', 'Ana Pérez', 'Clave-elegida-2026!', '2026-11').subscribe((r) => (result = r));

            const req = httpMock.expectOne(`${authUrl}/accept-invitation`);
            expect(req.request.method).toBe('POST');
            expect(req.request.body).toEqual({ token: 'tok-1', name: 'Ana Pérez', password: 'Clave-elegida-2026!', acceptedTermsVersion: '2026-11' });
            req.flush(null, { status: 204, statusText: 'No Content' });

            expect(result?.isSuccess).toBeTrue();
            expect(service.getToken()).toBeNull();
        });
    });
});
