import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { OperationResult } from '../../../shared/models/result.model';
import { PasswordService } from './password.service';

describe('PasswordService (spec 019)', () => {
    let service: PasswordService;
    let httpMock: HttpTestingController;
    const url = `${environment.apiUrl}/account/password`;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(PasswordService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('changes the password with a PUT to /account/password: the current one and the new one, nothing else', () => {
        service.change('actual-2026!', 'nueva-2026!').subscribe();

        const req = httpMock.expectOne(url);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual({ currentPassword: 'actual-2026!', newPassword: 'nueva-2026!' });
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('sends the code only when there is one (a second factor account)', () => {
        service.change('actual-2026!', 'nueva-2026!', '123456').subscribe();

        const req = httpMock.expectOne(url);
        expect(req.request.body).toEqual({ currentPassword: 'actual-2026!', newPassword: 'nueva-2026!', code: '123456' });
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('does not send an empty code: without the second factor the field must not travel', () => {
        service.change('actual-2026!', 'nueva-2026!', '').subscribe();

        const req = httpMock.expectOne(url);
        expect('code' in req.request.body).toBeFalse();
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('never puts a password in the URL or in a query string', () => {
        service.change('actual-2026!', 'nueva-2026!', '123456').subscribe();

        const req = httpMock.expectOne(url);
        expect(req.request.urlWithParams).toBe(url);
        expect(req.request.urlWithParams).not.toContain('2026');
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('reports success on a 204', () => {
        let result: OperationResult | undefined;
        service.change('a', 'b').subscribe((r) => (result = r));

        httpMock.expectOne(url).flush(null, { status: 204, statusText: 'No Content' });

        expect(result?.isSuccess).toBeTrue();
    });

    it('turns an API error into a result with the API text and its stable code (it never throws)', () => {
        let result: OperationResult | undefined;
        service.change('a', 'b').subscribe((r) => (result = r));

        httpMock.expectOne(url).flush({ type: 'about:blank', title: 'Bad Request', status: 400, code: 'password.current_invalid', detail: 'La contraseña actual no es correcta.' }, { status: 400, statusText: 'Bad Request' });

        expect(result?.isSuccess).toBeFalse();
        expect(result?.message).toBe('La contraseña actual no es correcta.');
        expect(result?.code).toBe('password.current_invalid');
    });

    it('keeps the API field errors of a validation failure', () => {
        let result: OperationResult | undefined;
        service.change('a', 'corta').subscribe((r) => (result = r));

        httpMock
            .expectOne(url)
            .flush({ type: 'about:blank', title: 'Validation', status: 400, code: 'validation.failed', detail: 'Hay datos que no valen.', errors: { newPassword: [{ code: 'x', message: 'Muy corta' }] } }, { status: 400, statusText: 'Bad Request' });

        expect(result?.isSuccess).toBeFalse();
        expect(result?.code).toBe('validation.failed');
        expect(result?.fieldErrors).toBeDefined();
    });

    it('reports a network failure with a message instead of throwing', () => {
        let result: OperationResult | undefined;
        service.change('a', 'b').subscribe((r) => (result = r));

        httpMock.expectOne(url).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

        expect(result?.isSuccess).toBeFalse();
        expect(result?.message).toBeTruthy();
    });
});
