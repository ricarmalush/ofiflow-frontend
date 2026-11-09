import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../../../../environments/environment';
import { CLOCK } from '../../../../core/services/clock';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { TenantRole } from '../../../../shared/models/auth.model';
import { QuoteListItem, QuoteStatus } from '../../../../shared/models/quote.model';
import { QuoteListComponent } from './quote-list.component';

const quotesUrl = `${environment.apiUrl}/quotes`;
const customersUrl = `${environment.apiUrl}/customers`;

const item = (number: number, status: QuoteStatus, overrides: Partial<QuoteListItem> = {}): QuoteListItem => ({
    id: `q-${number}`,
    number,
    customerId: 'c1',
    customerName: 'Ana Ruiz',
    jobId: null,
    title: `Presupuesto ${number}`,
    status,
    totalCents: 12100,
    validUntil: '2026-12-31',
    createdAt: '2026-11-09T09:00:00Z',
    sentAt: null,
    decidedAt: null,
    ...overrides
});

describe('QuoteListComponent', () => {
    let httpMock: HttpTestingController;
    let harness: RouterTestingHarness;
    let component: QuoteListComponent;

    async function open(role: TenantRole, items: QuoteListItem[], totalCount = items.length, permissions?: string[]): Promise<HTMLElement> {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount({ role, ...(permissions ? { permissions } : {}) }));

        harness = await RouterTestingHarness.create();
        component = await harness.navigateByUrl('/quotes', QuoteListComponent);
        if (session.can('Customers.Read')) {
            httpMock.expectOne(customersUrl).flush([{ id: 'c1', type: 'Person', name: 'Ana Ruiz', email: null, phone: null, address: null, notes: null }]);
        }
        httpMock.expectOne((r) => r.url === quotesUrl).flush({ items, page: 1, pageSize: 10, totalCount });
        harness.detectChanges();
        return harness.routeNativeElement as HTMLElement;
    }

    const firstCells = (host: HTMLElement) => Array.from(host.querySelectorAll('tbody tr td:first-child')).map((cell) => cell.textContent?.trim());
    const rowOf = (host: HTMLElement, number: string) => Array.from(host.querySelectorAll('tbody tr')).find((row) => row.querySelector('td')?.textContent?.trim() === number) as HTMLElement;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideRouter([{ path: 'quotes', component: QuoteListComponent }]), provideHttpClient(), provideHttpClientTesting(), { provide: CLOCK, useValue: () => new Date(2026, 10, 9, 12, 0) }]
        });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('asks for the first page of ten and shows the number, customer, state, total in euros and validity of each quote', async () => {
        const host = await open('Owner', [item(12, 'Sent'), item(11, 'Draft')]);

        expect(firstCells(host)).toEqual(['P-0012', 'P-0011']);
        const row = rowOf(host, 'P-0012');
        expect(row.textContent).toContain('Ana Ruiz');
        expect(row.textContent).toContain('Enviado');
        expect(row.textContent?.replace(/\s/g, ' ')).toContain('121,00');
        expect(row.textContent).toContain('2026-12-31');
    });

    it('requests page 1 with a page size of ten and no filter at the start', async () => {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount({ role: 'Owner' }));
        harness = await RouterTestingHarness.create();
        await harness.navigateByUrl('/quotes', QuoteListComponent);
        httpMock.expectOne(customersUrl).flush([]);

        const req = httpMock.expectOne((r) => r.url === quotesUrl);
        expect(req.request.params.get('page')).toBe('1');
        expect(req.request.params.get('pageSize')).toBe('10');
        expect(req.request.params.has('status')).toBeFalse();
        expect(req.request.params.has('customerId')).toBeFalse();
        req.flush({ items: [], page: 1, pageSize: 10, totalCount: 0 });
    });

    it('shows «Caducado» for a draft or sent quote whose validity passed, and never for a resolved one', async () => {
        const host = await open('Owner', [
            item(1, 'Draft', { validUntil: '2026-11-01' }),
            item(2, 'Sent', { validUntil: '2026-11-08' }),
            item(3, 'Accepted', { validUntil: '2026-01-01' }),
            item(4, 'Rejected', { validUntil: '2026-01-01' }),
            item(5, 'Sent', { validUntil: '2026-11-09' }), // hoy no está caducado
            item(6, 'Draft', { validUntil: null })
        ]);

        const expired = (n: string) => rowOf(host, n).textContent?.includes('Caducado');
        expect([expired('P-0001'), expired('P-0002'), expired('P-0003'), expired('P-0004'), expired('P-0005'), expired('P-0006')]).toEqual([true, true, false, false, false, false]);
    });

    it('offers to EDIT a draft and to VIEW the rest, to someone who can write', async () => {
        const host = await open('Owner', [item(1, 'Draft'), item(2, 'Sent'), item(3, 'Accepted')]);

        expect(rowOf(host, 'P-0001').querySelector('[aria-label="Editar"]')).not.toBeNull();
        expect(rowOf(host, 'P-0002').querySelector('[aria-label="Ver"]')).not.toBeNull();
        expect(rowOf(host, 'P-0002').querySelector('[aria-label="Editar"]')).toBeNull();
        expect(rowOf(host, 'P-0003').querySelector('[aria-label="Ver"]')).not.toBeNull();
    });

    it('someone who can only read (no Quotes.Write) can only view, even a draft, and has no «Nuevo presupuesto»', async () => {
        const host = await open('Employee', [item(1, 'Draft')], 1, ['Quotes.Read', 'Customers.Read']);

        expect(rowOf(host, 'P-0001').querySelector('[aria-label="Editar"]')).toBeNull();
        expect(rowOf(host, 'P-0001').querySelector('[aria-label="Ver"]')).not.toBeNull();
        expect(host.textContent).not.toContain('Nuevo presupuesto');
    });

    it('«Nuevo presupuesto» is offered to whoever has Quotes.Write', async () => {
        const host = await open('Employee', []);

        expect(host.textContent).toContain('Nuevo presupuesto');
    });

    it('says there are none when the page comes back empty', async () => {
        const host = await open('Owner', []);

        expect(host.textContent).toContain('No hay presupuestos.');
    });

    it('shows the message of the API when the list fails, and no rows', async () => {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount({ role: 'Owner' }));
        harness = await RouterTestingHarness.create();
        component = await harness.navigateByUrl('/quotes', QuoteListComponent);
        httpMock.expectOne(customersUrl).flush([]);
        httpMock.expectOne((r) => r.url === quotesUrl).flush({ status: 403, detail: 'No tienes permiso.', code: 'auth.forbidden' }, { status: 403, statusText: 'Forbidden' });
        harness.detectChanges();

        expect(component.errorMessage()).toBe('No tienes permiso.');
        expect(component.rows()).toEqual([]);
    });

    it('turns the page in the server: the second page asks for page 2', async () => {
        await open(
            'Owner',
            Array.from({ length: 10 }, (_, i) => item(i + 1, 'Draft')),
            25
        );

        component.onPage({ first: 10, rows: 10 });

        const req = httpMock.expectOne((r) => r.url === quotesUrl);
        expect(req.request.params.get('page')).toBe('2');
        req.flush({ items: [item(11, 'Draft')], page: 2, pageSize: 10, totalCount: 25 });
        expect(component.first()).toBe(10);
        expect(component.totalCount()).toBe(25);
    });

    it('filters by status in the server and goes back to the first page', async () => {
        await open('Owner', [item(1, 'Draft')], 30);
        component.onPage({ first: 20, rows: 10 });
        httpMock.expectOne((r) => r.url === quotesUrl).flush({ items: [], page: 3, pageSize: 10, totalCount: 30 });

        component.setStatus('Sent');

        const req = httpMock.expectOne((r) => r.url === quotesUrl);
        expect(req.request.params.get('status')).toBe('Sent');
        expect(req.request.params.get('page')).toBe('1');
        req.flush({ items: [item(2, 'Sent')], page: 1, pageSize: 10, totalCount: 1 });
        expect(component.first()).toBe(0);
    });

    it('filters by customer in the server, together with the status, and clears them', async () => {
        await open('Owner', [item(1, 'Draft')]);

        component.setStatus('Accepted');
        httpMock.expectOne((r) => r.url === quotesUrl).flush({ items: [], page: 1, pageSize: 10, totalCount: 0 });
        component.setCustomer('c1');
        const both = httpMock.expectOne((r) => r.url === quotesUrl);
        expect(both.request.params.get('status')).toBe('Accepted');
        expect(both.request.params.get('customerId')).toBe('c1');
        both.flush({ items: [], page: 1, pageSize: 10, totalCount: 0 });

        component.setStatus(null);
        component.setCustomer(null);
        httpMock.match((r) => r.url === quotesUrl).forEach((r) => r.flush({ items: [], page: 1, pageSize: 10, totalCount: 0 }));
        expect(component.statusFilter()).toBeNull();
        expect(component.customerFilter()).toBeNull();
    });

    it('without Customers.Read the customer filter is not offered and customers are not requested', async () => {
        const host = await open('Employee', [item(1, 'Draft')], 1, ['Quotes.Read', 'Quotes.Write']);

        expect(component.customerOptions()).toEqual([]);
        expect(host.querySelector('[aria-label="Filtrar por cliente"]')).toBeNull();
    });
});
