import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { OperationResult } from '../../../shared/models/result.model';
import { CustomerService } from './customer.service';

describe('CustomerService', () => {
    let service: CustomerService;
    let httpMock: HttpTestingController;
    const url = `${environment.apiUrl}/customers`;
    const input = { name: 'Fontanería López', email: null, phone: '600 123 123', address: null, notes: null };

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(CustomerService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('sends the customer type as the number the API enum expects and returns the new id', () => {
        let result: OperationResult<string> | undefined;
        service.create('Company', input).subscribe((r) => (result = r));

        const req = httpMock.expectOne(url);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ type: 1, ...input });
        req.flush({ id: 'abc' }, { status: 201, statusText: 'Created' });

        expect(result).toEqual({ isSuccess: true, message: '', data: 'abc' });
    });

    it('updates without sending the type (it cannot change)', () => {
        service.update('abc', input).subscribe();

        const req = httpMock.expectOne(`${url}/abc`);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual(input);
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('reports a 403 as a failure with the API message instead of throwing', () => {
        let result: OperationResult | undefined;
        service.delete('abc').subscribe((r) => (result = r));

        httpMock.expectOne(`${url}/abc`).flush({ status: 403, detail: 'No tienes permiso para esta operación.', code: 'Authorization.Forbidden' }, { status: 403, statusText: 'Forbidden' });

        expect(result?.isSuccess).toBeFalse();
        expect(result?.message).toBe('No tienes permiso para esta operación.');
        expect(result?.code).toBe('Authorization.Forbidden');
    });

    it('encodes the id so it cannot change the path', () => {
        service.get('../users').subscribe();

        const req = httpMock.expectOne(`${url}/..%2Fusers`);
        expect(req.request.url).not.toContain('/users');
        req.flush({});
    });
});
