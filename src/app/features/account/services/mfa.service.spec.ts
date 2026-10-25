import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth';
import { qrDataUrl } from '../../../core/utils/qr.util';
import { RecoveryCodes } from '../../../shared/models/mfa.model';
import { OperationResult } from '../../../shared/models/result.model';
import { MfaService } from './mfa.service';

describe('MfaService', () => {
    let service: MfaService;
    let httpMock: HttpTestingController;
    const url = `${environment.apiUrl}/account/mfa`;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(MfaService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('starts the setup with the password', () => {
        service.startSetup('secret-pw').subscribe();

        const req = httpMock.expectOne(`${url}/setup`);
        expect(req.request.body).toEqual({ password: 'secret-pw' });
        req.flush({ secret: 'ABC', otpAuthUri: 'otpauth://totp/OfiFlow:ana?secret=ABC' });
    });

    it('returns the recovery codes when the first code is confirmed', () => {
        let result: OperationResult<RecoveryCodes> | undefined;
        service.enable('123456').subscribe((r) => (result = r));

        httpMock.expectOne(`${url}/enable`).flush({ codes: ['AAAA-BBBB', 'CCCC-DDDD'] });

        expect(result?.data?.codes).toEqual(['AAAA-BBBB', 'CCCC-DDDD']);
    });

    it('disabling needs both the password and a code', () => {
        service.disable('secret-pw', '123456').subscribe();

        const req = httpMock.expectOne(`${url}/disable`);
        expect(req.request.body).toEqual({ password: 'secret-pw', code: '123456' });
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('shows the API message when the code is wrong', () => {
        let result: OperationResult | undefined;
        service.disable('secret-pw', '000000').subscribe((r) => (result = r));

        httpMock.expectOne(`${url}/disable`).flush({ status: 400, detail: 'El código no es válido.', code: 'mfa.invalid_code' }, { status: 400, statusText: 'Bad Request' });

        expect(result).toEqual(jasmine.objectContaining({ isSuccess: false, message: 'El código no es válido.' }));
    });
});

describe('qrDataUrl', () => {
    it('builds the QR locally as an image data URL, without calling any service', () => {
        expect(qrDataUrl('otpauth://totp/OfiFlow:ana?secret=JBSWY3DPEHPK3PXP&issuer=OfiFlow')).toMatch(/^data:image\/gif;base64,/);
    });
});

describe('AuthService.logout with a notice', () => {
    it('passes the notice to the login page in the navigation state, not in the URL', () => {
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        const router = TestBed.inject(Router);
        spyOn(router, 'navigate').and.resolveTo(true);

        TestBed.inject(AuthService).logout('Sesiones cerradas.');

        expect(router.navigate).toHaveBeenCalledWith(['/auth/login'], { state: { info: 'Sesiones cerradas.' } });
    });
});
