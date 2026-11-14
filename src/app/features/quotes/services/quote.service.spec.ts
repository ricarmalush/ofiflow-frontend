import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { QuoteInput } from '../../../shared/models/quote.model';
import { OperationResult } from '../../../shared/models/result.model';
import { QuoteService, QuotePdf, pdfFileNameFrom } from './quote.service';

describe('QuoteService', () => {
    let service: QuoteService;
    let httpMock: HttpTestingController;
    const url = `${environment.apiUrl}/quotes`;

    const input: QuoteInput = {
        jobId: 'job-1',
        title: 'Reforma del baño',
        notes: 'Pago a 30 días',
        validUntil: '2026-12-31',
        items: [{ description: 'Mano de obra', quantity: 2.5, unitPriceCents: 1234, vatPercent: 21 }]
    };

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(QuoteService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('lists a page with its size and no empty filter', () => {
        service.list({ status: null, customerId: null, page: 2, pageSize: 25 }).subscribe();

        const req = httpMock.expectOne((r) => r.url === url);
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('page')).toBe('2');
        expect(req.request.params.get('pageSize')).toBe('25');
        expect(req.request.params.has('status')).toBeFalse();
        expect(req.request.params.has('customerId')).toBeFalse();
        req.flush({ items: [], page: 2, pageSize: 25, totalCount: 0 });
    });

    it('sends the status and the customer filters when they are set', () => {
        service.list({ status: 'Sent', customerId: 'c-1', page: 1, pageSize: 10 }).subscribe();

        const req = httpMock.expectOne((r) => r.url === url);
        expect(req.request.params.get('status')).toBe('Sent');
        expect(req.request.params.get('customerId')).toBe('c-1');
        req.flush({ items: [], page: 1, pageSize: 10, totalCount: 0 });
    });

    it('creates with the customer and the whole header and lines, and returns the id', () => {
        let result: OperationResult<string> | undefined;
        service.create('cust-1', input).subscribe((r) => (result = r));

        const req = httpMock.expectOne(url);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ customerId: 'cust-1', ...input });
        req.flush({ id: 'q-1' }, { status: 201, statusText: 'Created' });

        expect(result?.data).toBe('q-1');
    });

    it('never sends a total, a net, a VAT amount, a number, a status or a company', () => {
        service.create('cust-1', input).subscribe();

        const body = httpMock.expectOne(url).request.body as Record<string, unknown>;
        const keys = [...Object.keys(body), ...(body['items'] as object[]).flatMap((line) => Object.keys(line))].map((key) => key.toLowerCase());
        for (const forbidden of ['total', 'net', 'vatcents', 'number', 'status', 'tenant', 'version']) {
            expect(keys.some((key) => key.includes(forbidden)))
                .withContext(forbidden)
                .toBeFalse();
        }
        httpMock.expectNone(`${url}/x`);
    });

    it('updates with a PUT that carries the version it read', () => {
        service.update('q-1', 'AQID', input).subscribe();

        const req = httpMock.expectOne(`${url}/q-1`);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual({ version: 'AQID', ...input });
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('turns a stale-version error into a failed result with its stable code', () => {
        let result: OperationResult | undefined;
        service.update('q-1', 'vieja', input).subscribe((r) => (result = r));

        httpMock.expectOne(`${url}/q-1`).flush({ status: 400, detail: 'Alguien lo modificó.', code: 'quote.changed_meanwhile' }, { status: 400, statusText: 'Bad Request' });

        expect(result?.isSuccess).toBeFalse();
        expect(result?.code).toBe('quote.changed_meanwhile');
        expect(result?.message).toBe('Alguien lo modificó.');
    });

    it('gets and deletes by id, encoding it', () => {
        service.get('a/b').subscribe();
        httpMock.expectOne(`${url}/a%2Fb`).flush({});
        service.delete('q-1').subscribe();
        const req = httpMock.expectOne(`${url}/q-1`);
        expect(req.request.method).toBe('DELETE');
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    for (const transition of ['send', 'accept', 'reject'] as const) {
        it(`${transition} is a POST to its own action, not a PUT of the status`, () => {
            service.transition('q-1', transition).subscribe();

            const req = httpMock.expectOne(`${url}/q-1/${transition}`);
            expect(req.request.method).toBe('POST');
            req.flush(null, { status: 204, statusText: 'No Content' });
        });
    }

    it('returns the API message, not an internal one, when a transition is refused', () => {
        let result: OperationResult | undefined;
        service.transition('q-1', 'accept').subscribe((r) => (result = r));

        httpMock.expectOne(`${url}/q-1/accept`).flush({ status: 400, detail: 'Solo se puede aceptar un presupuesto enviado.', code: 'quote.cannot_accept' }, { status: 400, statusText: 'Bad Request' });

        expect(result?.message).toBe('Solo se puede aceptar un presupuesto enviado.');
        expect(result?.code).toBe('quote.cannot_accept');
    });

    // ===== El PDF (spec 025) =====

    const pdfBlob = () => new Blob(['%PDF-1.7'], { type: 'application/pdf' });

    it('downloads the pdf with a GET as a file, with nothing in the body nor in the query', () => {
        let result: OperationResult<QuotePdf> | undefined;
        service.downloadPdf('q 1/2').subscribe((r) => (result = r));

        const req = httpMock.expectOne(`${url}/q%201%2F2/pdf`);
        expect(req.request.method).toBe('GET');
        expect(req.request.responseType).toBe('blob');
        expect(req.request.body).toBeNull();
        expect(req.request.params.keys().length).toBe(0);
        expect(req.request.url).not.toContain('token');
        req.flush(pdfBlob(), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': "attachment; filename=presupuesto-P-0012.pdf; filename*=UTF-8''presupuesto-P-0012.pdf" } });

        expect(result?.isSuccess).toBeTrue();
        expect(result?.data?.blob.type).toBe('application/pdf');
        expect(result?.data?.fileName).toBe('presupuesto-P-0012.pdf');
    });

    it('gives no file name when the API does not say one the app can read (for example, because of CORS)', () => {
        let result: OperationResult<QuotePdf> | undefined;
        service.downloadPdf('q-1').subscribe((r) => (result = r));

        httpMock.expectOne(`${url}/q-1/pdf`).flush(pdfBlob(), { headers: { 'Content-Type': 'application/pdf' } });

        expect(result?.isSuccess).toBeTrue();
        expect(result?.data?.fileName).toBeNull();
    });

    it('treats an answer that is not a pdf as a failure, never as a file', () => {
        let result: OperationResult<QuotePdf> | undefined;
        service.downloadPdf('q-1').subscribe((r) => (result = r));

        httpMock.expectOne(`${url}/q-1/pdf`).flush(new Blob(['<html>proxy</html>'], { type: 'text/html' }), { headers: { 'Content-Type': 'text/html' } });

        expect(result?.isSuccess).toBeFalse();
        expect(result?.data).toBeUndefined();
        expect(result?.message.length).toBeGreaterThan(0);
    });

    it('turns an error of the API into the usual failure with its code and text', () => {
        let result: OperationResult<QuotePdf> | undefined;
        service.downloadPdf('q-1').subscribe((r) => (result = r));

        // Con el cuerpo ya como objeto, que es como lo deja el interceptor tras leer el Blob.
        httpMock.expectOne(`${url}/q-1/pdf`).error(new ProgressEvent('error'), { status: 400, statusText: 'Bad Request' });

        expect(result?.isSuccess).toBeFalse();
    });

    describe('pdfFileNameFrom', () => {
        it('reads the name of a well-formed header', () => {
            expect(pdfFileNameFrom('attachment; filename=presupuesto-P-0001.pdf')).toBe('presupuesto-P-0001.pdf');
            expect(pdfFileNameFrom('attachment; filename="presupuesto-P-0012.pdf"')).toBe('presupuesto-P-0012.pdf');
            expect(pdfFileNameFrom("attachment; filename=presupuesto-P-123456.pdf; filename*=UTF-8''presupuesto-P-123456.pdf")).toBe('presupuesto-P-123456.pdf');
            expect(pdfFileNameFrom('ATTACHMENT; FileName=presupuesto-P-0007.pdf')).toBe('presupuesto-P-0007.pdf');
        });

        it('gives null without a header', () => {
            expect(pdfFileNameFrom(null)).toBeNull();
            expect(pdfFileNameFrom('')).toBeNull();
            expect(pdfFileNameFrom('attachment')).toBeNull();
        });

        it('never accepts a name that is not exactly the expected shape', () => {
            const hostile = [
                'attachment; filename=../../etc/passwd',
                'attachment; filename=presupuesto-P-0012.exe',
                'attachment; filename=presupuesto-P-0012.pdf.exe',
                'attachment; filename=../presupuesto-P-0012.pdf',
                'attachment; filename=x presupuesto-P-0012.pdf',
                'attachment; filename=C:/presupuesto-P-0012.pdf',
                'attachment; filename=presupuesto-P-0012.pdf/../x.pdf',
                'attachment; filename=Presupuesto-P-0012.pdf',
                'attachment; filename=presupuesto-0012.pdf',
                'attachment; filename=presupuesto-P-12.pdf',
                'attachment; filename=presupuesto-P-12345678901.pdf',
                'attachment; filename=presupuesto-P-00a2.pdf',
                'attachment; filename=reforma del baño.pdf',
                'attachment; filename=presupuesto-P-0012.pdf\r\nSet-Cookie: x=1',
                'attachment; filename=C:\\Windows\\x.pdf',
                'attachment; filename='
            ];

            for (const header of hostile) {
                expect(pdfFileNameFrom(header)).withContext(header).toBeNull();
            }
        });
    });
});
