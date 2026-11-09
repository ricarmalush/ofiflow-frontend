import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { CompanyProfile, CompanyProfileInput, EMPTY_COMPANY_PROFILE } from '../../../shared/models/company-profile.model';
import { OperationResult } from '../../../shared/models/result.model';
import { CompanyService } from './company.service';

describe('CompanyService', () => {
    let service: CompanyService;
    let httpMock: HttpTestingController;
    const url = `${environment.apiUrl}/company/profile`;

    const input: CompanyProfileInput = {
        legalName: 'Fontanería Demo S.L.',
        taxId: 'B12345674',
        addressLine: 'Calle Mayor 1',
        postalCode: '28001',
        city: 'Madrid',
        province: 'Madrid',
        phone: '600123456',
        email: 'info@demo.es'
    };

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(CompanyService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('reads the profile with a GET to /company/profile, with no id and no company anywhere in the request', () => {
        let result: OperationResult<CompanyProfile> | undefined;
        service.get().subscribe((r) => (result = r));

        const req = httpMock.expectOne(url);
        expect(req.request.method).toBe('GET');
        expect(req.request.params.keys().length).toBe(0);
        req.flush({ ...input, isComplete: true });

        expect(result?.isSuccess).toBeTrue();
        expect(result?.data?.taxId).toBe('B12345674');
        expect(result?.data?.isComplete).toBeTrue();
    });

    it('a company with no profile is a success with every field null and isComplete false, not an error', () => {
        let result: OperationResult<CompanyProfile> | undefined;
        service.get().subscribe((r) => (result = r));

        httpMock.expectOne(url).flush(EMPTY_COMPANY_PROFILE);

        expect(result?.isSuccess).toBeTrue();
        expect(result?.data).toEqual(EMPTY_COMPANY_PROFILE);
        expect(result?.data?.isComplete).toBeFalse();
    });

    it('saves with a PUT that carries the eight fields and nothing else', () => {
        service.save(input).subscribe();

        const req = httpMock.expectOne(url);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual(input);
        expect(Object.keys(req.request.body as object).sort()).toEqual(['addressLine', 'city', 'email', 'legalName', 'phone', 'postalCode', 'province', 'taxId']);
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('never sends a company, an id, a date or whether it is complete', () => {
        service.save(input).subscribe();

        const keys = Object.keys(httpMock.expectOne(url).request.body as object).map((key) => key.toLowerCase());
        for (const forbidden of ['tenant', 'company', 'id', 'createdat', 'updatedat', 'iscomplete', 'version']) {
            expect(keys.some((key) => key === forbidden || (forbidden !== 'id' && key.includes(forbidden))))
                .withContext(forbidden)
                .toBeFalse();
        }
    });

    it('saving succeeds on a 204 and has no data', () => {
        let result: OperationResult | undefined;
        service.save(input).subscribe((r) => (result = r));

        httpMock.expectOne(url).flush(null, { status: 204, statusText: 'No Content' });

        expect(result?.isSuccess).toBeTrue();
        expect(result?.data).toBeNull();
    });

    it('a 400 comes back as a failure with the message, the code and one error per field', () => {
        let result: OperationResult | undefined;
        service.save(input).subscribe((r) => (result = r));

        httpMock.expectOne(url).flush(
            {
                status: 400,
                code: 'validation.failed',
                detail: 'Hay datos que corregir.',
                errors: [{ field: 'TaxId', code: 'company.tax_id_invalid', message: 'El NIF no es válido.' }]
            },
            { status: 400, statusText: 'Bad Request' }
        );

        expect(result?.isSuccess).toBeFalse();
        expect(result?.message).toBe('Hay datos que corregir.');
        expect(result?.code).toBe('validation.failed');
        expect(result?.fieldErrors?.[0]).toEqual({ field: 'TaxId', code: 'company.tax_id_invalid', message: 'El NIF no es válido.' });
    });

    it('a 403 on reading is a failure that does not throw', () => {
        let result: OperationResult<CompanyProfile> | undefined;
        service.get().subscribe((r) => (result = r));

        httpMock.expectOne(url).flush({ status: 403, code: 'auth.forbidden', detail: 'No tienes permiso.' }, { status: 403, statusText: 'Forbidden' });

        expect(result?.isSuccess).toBeFalse();
        expect(result?.code).toBe('auth.forbidden');
    });

    it('without network it fails with a message instead of throwing', () => {
        let result: OperationResult<CompanyProfile> | undefined;
        service.get().subscribe((r) => (result = r));

        httpMock.expectOne(url).error(new ProgressEvent('error'));

        expect(result?.isSuccess).toBeFalse();
        expect(result?.message).toBeTruthy();
    });
});
