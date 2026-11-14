import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { MFA_ENROLLMENT_REQUIRED_CODE, SECURITY_ROUTE, TENANT_SUSPENDED_MESSAGE } from '../constants/api-error-codes';
import { AuthService, SESSION_ENDED_MESSAGE } from '../services/auth';
import { CurrentSessionService } from '../services/current-session';
import { buildAccount } from '../testing/fake-account';
import { buildSessionToken } from '../testing/fake-jwt';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
    let http: HttpClient;
    let httpMock: HttpTestingController;
    let authService: AuthService;
    const jobsUrl = `${environment.apiUrl}/jobs`;
    const refreshUrl = `${environment.apiUrl}/auth/refresh`;
    const accountUrl = `${environment.apiUrl}/account/me`;
    const token = buildSessionToken();
    const newToken = buildSessionToken({ role: 'Admin' });

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({
            providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()]
        });
        http = TestBed.inject(HttpClient);
        httpMock = TestBed.inject(HttpTestingController);
        authService = TestBed.inject(AuthService);
        authService.storeSession({ accessToken: token, refreshToken: 'refresh-1', expiresAt: '' });
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

    it('adds the bearer token to calls to our API', () => {
        http.get(jobsUrl).subscribe();

        const req = httpMock.expectOne(jobsUrl);
        expect(req.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
        req.flush([]);
    });

    it('never sends the token to another domain', () => {
        http.get('https://cdn.example.com/data.json').subscribe();

        const req = httpMock.expectOne('https://cdn.example.com/data.json');
        expect(req.request.headers.has('Authorization')).toBeFalse();
        req.flush({});
    });

    it('on a 401 refreshes the session and retries the request once with the new token', () => {
        let body: unknown;
        http.get(jobsUrl).subscribe((b) => (body = b));

        httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
        httpMock.expectOne(refreshUrl).flush({ accessToken: newToken, refreshToken: 'refresh-2', expiresAt: '' });
        httpMock.expectOne(accountUrl).flush(buildAccount()); // renovar la sesión también vuelve a preguntar quién soy
        const retry = httpMock.expectOne(jobsUrl);
        expect(retry.request.headers.get('Authorization')).toBe(`Bearer ${newToken}`);
        retry.flush([{ id: 1 }]);

        expect(body).toEqual([{ id: 1 }]);
    });

    it('does not show any notice when the refresh works (an expired access token is routine)', () => {
        spyOn(authService, 'logout');

        http.get(jobsUrl).subscribe();
        httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
        httpMock.expectOne(refreshUrl).flush({ accessToken: newToken, refreshToken: 'refresh-2', expiresAt: '' });
        httpMock.expectOne(accountUrl).flush(buildAccount());
        httpMock.expectOne(jobsUrl).flush([]);

        expect(authService.logout).not.toHaveBeenCalled();
    });

    describe('when the session was closed (spec 015 of the API)', () => {
        it('goes back to the login WITH a warning notice when the refresh is rejected too', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
            httpMock.expectOne(refreshUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

            expect(authService.logout).toHaveBeenCalledOnceWith(SESSION_ENDED_MESSAGE, 'warn');
        });

        it('hands the notice to the login in the navigation state (not in the URL), with the warning severity', () => {
            const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
            httpMock.expectOne(refreshUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

            expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], { state: { info: 'Tu sesión se cerró. Vuelve a entrar.', infoSeverity: 'warn' } });
            expect(authService.getToken()).toBeNull();
            expect(authService.getRefreshToken()).toBeNull();
        });

        it('still hands the original 401 to whoever made the request', () => {
            spyOn(authService, 'logout');
            let status: number | undefined;

            http.get(jobsUrl).subscribe({ error: (e) => (status = e.status) });
            httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
            httpMock.expectOne(refreshUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

            expect(status).toBe(401);
        });

        it('with no refresh token left it asks nothing and goes back to the login with the notice', () => {
            spyOn(authService, 'logout');
            sessionStorage.removeItem('ofiflow_refresh_token');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

            httpMock.expectNone(refreshUrl);
            expect(authService.logout).toHaveBeenCalledOnceWith(SESSION_ENDED_MESSAGE, 'warn');
        });

        it('does not add the notice to a 403 (a role that cannot do something is not a closed session)', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'auth.forbidden' }, { status: 403, statusText: 'Forbidden' });
            httpMock.expectOne(accountUrl).flush(buildAccount());

            expect(authService.logout).not.toHaveBeenCalled();
        });
    });

    it('leaves the 401 of the login alone (a wrong password is a normal answer)', () => {
        spyOn(authService, 'logout');

        http.post(`${environment.apiUrl}/auth/login`, {}).subscribe({ error: () => undefined });
        const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
        expect(req.request.headers.has('Authorization')).toBeFalse();
        req.flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(authService.logout).not.toHaveBeenCalled();
    });

    describe('when the company is suspended (spec 011)', () => {
        const suspended = { status: 403, statusText: 'Forbidden' };

        it('logs out with the API message as a warning, and neither refreshes nor retries', () => {
            spyOn(authService, 'logout');

            let failed: unknown;
            http.get(jobsUrl).subscribe({ error: (e) => (failed = e) });
            httpMock.expectOne(jobsUrl).flush({ code: 'tenant.suspended', detail: 'La empresa está suspendida. Ponte en contacto con el soporte de OfiFlow.' }, suspended);

            // httpMock.verify() (afterEach) comprueba que no hubo refresh ni reintento.
            expect(authService.logout).toHaveBeenCalledOnceWith('La empresa está suspendida. Ponte en contacto con el soporte de OfiFlow.', 'warn');
            expect(failed).toBeTruthy(); // y el error sigue llegando a quien llamó
        });

        it('uses a fallback message if the 403 comes without text', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'tenant.suspended' }, suspended);

            expect(authService.logout).toHaveBeenCalledOnceWith(TENANT_SUSPENDED_MESSAGE, 'warn');
        });

        it('does NOT log out on a 403 for lack of permission: that one is about the role, not the session', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'auth.forbidden', detail: 'No tienes permiso.' }, suspended);
            httpMock.expectOne(accountUrl).flush(buildAccount()); // sí vuelve a pedir la cuenta (ver abajo)

            expect(authService.logout).not.toHaveBeenCalled();
        });

        it('does NOT log out on a 403 without a recognisable body', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush('<html>Forbidden</html>', suspended);

            expect(authService.logout).not.toHaveBeenCalled();
        });
    });

    describe('when the API says "your role cannot do this" (auth.forbidden)', () => {
        const forbidden = { status: 403, statusText: 'Forbidden' };

        it('asks again who I am: the interface was offering something the role no longer allows, so its idea of my role is stale', () => {
            const session = TestBed.inject(CurrentSessionService);
            session.setAccount(buildAccount({ role: 'Manager' })); // lo que la interfaz cree
            let failed: unknown;

            http.get(jobsUrl).subscribe({ error: (e) => (failed = e) });
            httpMock.expectOne(jobsUrl).flush({ code: 'auth.forbidden', detail: 'No tienes permiso.' }, forbidden);
            httpMock.expectOne(accountUrl).flush(buildAccount({ role: 'Technician' })); // lo que la API dice ahora

            expect(session.role()).toBe('Technician');
            expect(session.can('Jobs.Assign')).toBeFalse();
            expect(failed).toBeTruthy(); // y el error sigue llegando a quien llamó, para que avise al usuario
        });

        it('does not loop when the 403 is the one of the account request itself (a removed member)', () => {
            http.get(accountUrl).subscribe({ error: () => undefined });

            httpMock.expectOne(accountUrl).flush({ code: 'auth.forbidden', detail: 'No tienes permiso.' }, forbidden);

            httpMock.expectNone(accountUrl); // httpMock.verify() también lo comprueba
        });

        it('does not ask for the account on other errors (a 500 or a validation error say nothing about the role)', () => {
            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'server.unexpected' }, { status: 500, statusText: 'Server Error' });

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'validation.failed' }, { status: 400, statusText: 'Bad Request' });

            httpMock.expectNone(accountUrl);
        });

        it('a suspended company closes the session instead of asking for the account', () => {
            spyOn(authService, 'logout');

            http.get(jobsUrl).subscribe({ error: () => undefined });
            httpMock.expectOne(jobsUrl).flush({ code: 'tenant.suspended', detail: 'Suspendida.' }, forbidden);

            httpMock.expectNone(accountUrl);
            expect(authService.logout).toHaveBeenCalled();
        });
    });
});

describe('authInterceptor · segundo factor obligatorio (spec 022)', () => {
    let http: HttpClient;
    let httpMock: HttpTestingController;
    let authService: AuthService;
    let router: Router;
    let navigate: jasmine.Spy;
    const jobsUrl = `${environment.apiUrl}/jobs`;
    const accountUrl = `${environment.apiUrl}/account/me`;
    const refreshUrl = `${environment.apiUrl}/auth/refresh`;
    const enrollmentRequired = { type: 'about:blank', title: 'Forbidden', status: 403, code: MFA_ENROLLMENT_REQUIRED_CODE, detail: 'Tu rol exige el segundo factor. Actívalo para continuar.' };
    const mustEnroll = () => buildAccount({ role: 'Admin', secondFactorEnrollmentRequired: true, secondFactorRequired: true });

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
        http = TestBed.inject(HttpClient);
        httpMock = TestBed.inject(HttpTestingController);
        authService = TestBed.inject(AuthService);
        router = TestBed.inject(Router);
        navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
        authService.storeSession({ accessToken: buildSessionToken(), refreshToken: 'refresh-1', expiresAt: '' });
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

    it('asks again who I am and, if the account says it must enrol the factor, takes the person to the security screen', () => {
        http.get(jobsUrl).subscribe({ error: () => undefined });

        httpMock.expectOne(jobsUrl).flush(enrollmentRequired, { status: 403, statusText: 'Forbidden' });
        httpMock.expectOne(accountUrl).flush(mustEnroll());

        expect(navigate).toHaveBeenCalledOnceWith(SECURITY_ROUTE);
    });

    it('does NOT close the session, does not refresh it and does not retry the request (it would answer 403 again)', () => {
        spyOn(authService, 'logout');
        http.get(jobsUrl).subscribe({ error: () => undefined });

        httpMock.expectOne(jobsUrl).flush(enrollmentRequired, { status: 403, statusText: 'Forbidden' });
        httpMock.expectOne(accountUrl).flush(mustEnroll());

        expect(authService.logout).not.toHaveBeenCalled();
        httpMock.expectNone(refreshUrl);
        httpMock.expectNone(jobsUrl);
    });

    it('still hands the 403 to whoever made the request (they show the API text)', () => {
        let received: HttpErrorResponse | undefined;
        http.get(jobsUrl).subscribe({ error: (e) => (received = e) });

        httpMock.expectOne(jobsUrl).flush(enrollmentRequired, { status: 403, statusText: 'Forbidden' });
        httpMock.expectOne(accountUrl).flush(mustEnroll());

        expect(received?.status).toBe(403);
        expect((received?.error as { code: string }).code).toBe(MFA_ENROLLMENT_REQUIRED_CODE);
    });

    it('does not navigate if the fresh account says it does NOT have to enrol (the 403 was stale: do not trap anyone)', () => {
        http.get(jobsUrl).subscribe({ error: () => undefined });

        httpMock.expectOne(jobsUrl).flush(enrollmentRequired, { status: 403, statusText: 'Forbidden' });
        httpMock.expectOne(accountUrl).flush(buildAccount({ role: 'Admin', secondFactorEnrollmentRequired: false }));

        expect(navigate).not.toHaveBeenCalled();
    });

    it('does not move anyone on the strength of an OLD account when the fresh one could not be checked (the next navigation meets the guard anyway)', () => {
        TestBed.inject(CurrentSessionService).setAccount(mustEnroll()); // la cuenta de antes dice «debe activarlo»
        http.get(jobsUrl).subscribe({ error: () => undefined });

        httpMock.expectOne(jobsUrl).flush(enrollmentRequired, { status: 403, statusText: 'Forbidden' });
        httpMock.expectOne(accountUrl).flush(null, { status: 500, statusText: 'Server Error' });

        expect(navigate).not.toHaveBeenCalled();
    });

    it('does not navigate if the account could not be loaded', () => {
        http.get(jobsUrl).subscribe({ error: () => undefined });

        httpMock.expectOne(jobsUrl).flush(enrollmentRequired, { status: 403, statusText: 'Forbidden' });
        httpMock.expectOne(accountUrl).flush(null, { status: 500, statusText: 'Server Error' });

        expect(navigate).not.toHaveBeenCalled();
    });

    it('does not navigate when it is already on the security screen (no loop)', () => {
        spyOnProperty(router, 'url', 'get').and.returnValue(SECURITY_ROUTE);
        http.get(jobsUrl).subscribe({ error: () => undefined });

        httpMock.expectOne(jobsUrl).flush(enrollmentRequired, { status: 403, statusText: 'Forbidden' });
        httpMock.expectOne(accountUrl).flush(mustEnroll());

        expect(navigate).not.toHaveBeenCalled();
    });

    it('does not loop when the 403 is the one of the account request itself', () => {
        http.get(accountUrl).subscribe({ error: () => undefined });

        httpMock.expectOne(accountUrl).flush(enrollmentRequired, { status: 403, statusText: 'Forbidden' });

        httpMock.expectNone(accountUrl);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('several 403s at once ask for the account only once (the request is shared) and navigate once', () => {
        http.get(jobsUrl).subscribe({ error: () => undefined });
        http.get(`${environment.apiUrl}/customers`).subscribe({ error: () => undefined });

        httpMock.expectOne(jobsUrl).flush(enrollmentRequired, { status: 403, statusText: 'Forbidden' });
        httpMock.expectOne(`${environment.apiUrl}/customers`).flush(enrollmentRequired, { status: 403, statusText: 'Forbidden' });
        httpMock.expectOne(accountUrl).flush(mustEnroll());

        expect(navigate).toHaveBeenCalled();
        navigate.calls.allArgs().forEach((args) => expect(args).toEqual([SECURITY_ROUTE]));
    });

    it('is decided by the code, not by the 403 alone: another 403 code does not ask for the account', () => {
        http.get(jobsUrl).subscribe({ error: () => undefined });

        httpMock.expectOne(jobsUrl).flush({ ...enrollmentRequired, code: 'something.else' }, { status: 403, statusText: 'Forbidden' });

        httpMock.expectNone(accountUrl);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('is not mixed up with auth.forbidden: that one is "your role cannot", this one is "enrol and you can"', () => {
        http.get(jobsUrl).subscribe({ error: () => undefined });

        httpMock.expectOne(jobsUrl).flush({ ...enrollmentRequired, code: 'auth.forbidden' }, { status: 403, statusText: 'Forbidden' });
        httpMock.expectOne(accountUrl).flush(buildAccount({ role: 'Technician' }));

        expect(navigate).not.toHaveBeenCalled();
    });

    it('a 403 with the code on an anonymous auth route is left alone (those never carry the token nor this logic)', () => {
        http.post(`${environment.apiUrl}/auth/login`, {}).subscribe({ error: () => undefined });

        httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush(enrollmentRequired, { status: 403, statusText: 'Forbidden' });

        httpMock.expectNone(accountUrl);
        expect(navigate).not.toHaveBeenCalled();
    });
});

describe('authInterceptor · descargas (spec 025)', () => {
    let http: HttpClient;
    let httpMock: HttpTestingController;
    let authService: AuthService;
    const jobsUrl = `${environment.apiUrl}/jobs`;
    const refreshUrl = `${environment.apiUrl}/auth/refresh`;
    const accountUrl = `${environment.apiUrl}/account/me`;
    const token = buildSessionToken();
    const newToken = buildSessionToken({ role: 'Admin' });

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({
            providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()]
        });
        http = TestBed.inject(HttpClient);
        httpMock = TestBed.inject(HttpTestingController);
        authService = TestBed.inject(AuthService);
        authService.storeSession({ accessToken: token, refreshToken: 'refresh-1', expiresAt: '' });
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

    // ===== Las descargas (spec 025): el error de una petición que espera un fichero llega como un Blob =====
    // Leer un Blob es asíncrono: cada test espera a que el error llegue de verdad a quien hizo la petición (o, si no llega, una pequeña pausa).

    const blobOf = (body: unknown) => new Blob([typeof body === 'string' ? body : JSON.stringify(body)], { type: 'application/problem+json' });
    const pdfUrl = `${environment.apiUrl}/quotes/q-1/pdf`;
    const pause = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

    function failedDownload(): Promise<HttpErrorResponse> {
        return new Promise((resolve) => {
            http.get(pdfUrl, { responseType: 'blob' }).subscribe({ error: (e: HttpErrorResponse) => resolve(e) });
        });
    }

    it('reads the JSON inside the Blob of a failed download so the error arrives like any other', async () => {
        const outcome = failedDownload();

        httpMock.expectOne(pdfUrl).flush(blobOf({ status: 400, code: 'quote.company_profile_incomplete', detail: 'Faltan los datos de la empresa.' }), { status: 400, statusText: 'Bad Request' });
        const error = await outcome;

        expect(error.status).toBe(400);
        expect(error.error).toEqual({ status: 400, code: 'quote.company_profile_incomplete', detail: 'Faltan los datos de la empresa.' });
    });

    it('keeps the status, the text and the headers of the original error', async () => {
        const outcome = failedDownload();

        httpMock.expectOne(pdfUrl).flush(blobOf({ code: 'rate_limit.exceeded' }), { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '30' } });
        const error = await outcome;

        expect(error.status).toBe(429);
        expect(error.statusText).toBe('Too Many Requests');
        expect(error.headers.get('Retry-After')).toBe('30');
        expect(error.url).toBe(pdfUrl);
    });

    it('leaves a Blob that is not JSON as text, so the screen shows its fallback message', async () => {
        const outcome = failedDownload();

        httpMock.expectOne(pdfUrl).flush(new Blob(['<html>Bad gateway</html>'], { type: 'text/html' }), { status: 502, statusText: 'Bad Gateway' });
        const error = await outcome;

        expect(error.status).toBe(502);
        expect(error.error).toBe('<html>Bad gateway</html>');
    });

    it('a download of a suspended company still closes the session (the code was inside the Blob)', async () => {
        spyOn(authService, 'logout');
        const outcome = failedDownload();

        httpMock.expectOne(pdfUrl).flush(blobOf({ code: 'tenant.suspended', detail: 'Tu empresa está suspendida.' }), { status: 403, statusText: 'Forbidden' });
        const error = await outcome;

        expect(authService.logout).toHaveBeenCalledWith('Tu empresa está suspendida.', 'warn');
        expect(error.status).toBe(403);
    });

    it('a download refused by role asks for the account again (the code was inside the Blob)', async () => {
        const outcome = failedDownload();

        httpMock.expectOne(pdfUrl).flush(blobOf({ code: 'auth.forbidden' }), { status: 403, statusText: 'Forbidden' });
        await outcome;

        httpMock.expectOne(accountUrl).flush(buildAccount());
    });

    it('a download that needs the second factor takes the person to the security screen (the code was inside the Blob)', async () => {
        const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
        const outcome = failedDownload();

        httpMock.expectOne(pdfUrl).flush(blobOf({ code: MFA_ENROLLMENT_REQUIRED_CODE }), { status: 403, statusText: 'Forbidden' });
        await outcome;
        httpMock.expectOne(accountUrl).flush(buildAccount({ role: 'Admin', secondFactorEnrollmentRequired: true, secondFactorRequired: true }));

        expect(navigate).toHaveBeenCalledOnceWith(SECURITY_ROUTE);
    });

    it('a download with an expired token is refreshed and retried like any other call', async () => {
        let body: unknown;
        http.get(pdfUrl, { responseType: 'blob' }).subscribe((b) => (body = b));

        httpMock.expectOne(pdfUrl).flush(blobOf({ code: 'auth.unauthorized' }), { status: 401, statusText: 'Unauthorized' });
        await pause();
        httpMock.expectOne(refreshUrl).flush({ accessToken: newToken, refreshToken: 'refresh-2', expiresAt: '' });
        httpMock.expectOne(accountUrl).flush(buildAccount());
        const retry = httpMock.expectOne(pdfUrl);
        expect(retry.request.headers.get('Authorization')).toBe(`Bearer ${newToken}`);
        retry.flush(new Blob(['%PDF-1.7'], { type: 'application/pdf' }));

        expect((body as Blob).type).toBe('application/pdf');
    });

    it('does not touch the errors of an ordinary JSON call', () => {
        let error: HttpErrorResponse | undefined;
        http.get(jobsUrl).subscribe({ error: (e: HttpErrorResponse) => (error = e) });

        httpMock.expectOne(jobsUrl).flush({ code: 'job.not_found' }, { status: 404, statusText: 'Not Found' });

        expect(error?.status).toBe(404);
        expect(error?.error).toEqual({ code: 'job.not_found' });
    });
});
