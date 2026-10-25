import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LoginOutcome } from '../../shared/models/auth.model';
import { OperationResult } from '../../shared/models/result.model';
import { buildSessionToken } from '../testing/fake-jwt';
import { AuthService, INVALID_CREDENTIALS_MESSAGE, INVALID_MFA_CODE_MESSAGE } from './auth';
import { CurrentSessionService } from './current-session';

describe('AuthService', () => {
    let service: AuthService;
    let httpMock: HttpTestingController;
    const authUrl = `${environment.apiUrl}/auth`;
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
            expect(TestBed.inject(CurrentSessionService).role()).toBe('Owner');
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

            expect(refreshed).toBeTrue();
            expect(service.getRefreshToken()).toBe('refresh-2');
        });

        it('sends a single request when several callers refresh at once (the API revokes a reused token)', () => {
            const results: boolean[] = [];
            service.refresh().subscribe((r) => results.push(r));
            service.refresh().subscribe((r) => results.push(r));

            httpMock.expectOne(`${authUrl}/refresh`).flush({ ...tokens, refreshToken: 'refresh-2' });

            expect(results).toEqual([true, true]);
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
});
