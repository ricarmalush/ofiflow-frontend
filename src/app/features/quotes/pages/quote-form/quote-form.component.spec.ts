import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../../../environments/environment';
import { CLOCK } from '../../../../core/services/clock';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { TenantRole } from '../../../../shared/models/auth.model';
import { Quote, QuoteStatus } from '../../../../shared/models/quote.model';
import { QuoteFormComponent } from './quote-form.component';

const quotesUrl = `${environment.apiUrl}/quotes`;
const customersUrl = `${environment.apiUrl}/customers`;
const jobsUrl = `${environment.apiUrl}/jobs`;

const customer = (id: string, name: string) => ({ id, type: 'Person', name, email: null, phone: null, address: null, notes: null });
const job = (id: string, customerId: string, title: string) => ({ id, customerId, title, description: null, status: 'New', priority: 'Normal', scheduledDate: null, assignedTenantUserId: null, estimatedDurationMinutes: null });

// Un presupuesto como lo devolvería la API: 2,5 × 12,34 € al 21 % y 1 × 50 € al 0 % (neto 8085, IVA 648, total 8733).
const quote = (status: QuoteStatus = 'Draft', overrides: Partial<Quote> = {}): Quote => ({
    id: 'q-1',
    number: 12,
    customerId: 'c1',
    customerName: 'Ana Ruiz',
    jobId: null,
    title: 'Reforma del baño',
    notes: 'Pago a 30 días',
    validUntil: '2026-12-31',
    status,
    netCents: 8085,
    vatCents: 648,
    totalCents: 8733,
    vatBreakdown: [
        { vatPercent: 0, baseCents: 5000, vatCents: 0 },
        { vatPercent: 21, baseCents: 3085, vatCents: 648 }
    ],
    items: [
        { id: 'i2', position: 1, description: 'Material', quantity: 1, unitPriceCents: 5000, vatPercent: 0, netCents: 5000 },
        { id: 'i1', position: 0, description: 'Mano de obra', quantity: 2.5, unitPriceCents: 1234, vatPercent: 21, netCents: 3085 }
    ],
    sentAt: status === 'Draft' ? null : '2026-11-09T10:00:00Z',
    decidedAt: status === 'Accepted' || status === 'Rejected' ? '2026-11-10T10:00:00Z' : null,
    createdAt: '2026-11-09T09:00:00Z',
    version: 'VERSION-1',
    ...overrides
});

describe('QuoteFormComponent', () => {
    let httpMock: HttpTestingController;
    let harness: RouterTestingHarness;
    let component: QuoteFormComponent;
    let messages: jasmine.Spy;
    let confirm: jasmine.Spy;

    // Abre /quotes/new o /quotes/q-1 con el rol indicado y responde a las peticiones de la carga.
    async function open(role: TenantRole, loaded: Quote | null = quote(), permissions?: string[]): Promise<HTMLElement> {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount({ role, ...(permissions ? { permissions } : {}) }));

        harness = await RouterTestingHarness.create();
        component = await harness.navigateByUrl(loaded ? '/quotes/q-1' : '/quotes/new', QuoteFormComponent);
        httpMock.expectOne(customersUrl).flush([customer('c1', 'Ana Ruiz'), customer('c2', 'Luis Gómez')]);
        if (session.can('Jobs.Read')) {
            httpMock.expectOne(jobsUrl).flush([job('j1', 'c1', 'Trabajo de Ana'), job('j2', 'c2', 'Trabajo de Luis')]);
        }
        if (loaded) {
            httpMock.expectOne(`${quotesUrl}/q-1`).flush(loaded);
        }
        await settle();
        return harness.routeNativeElement as HTMLElement;
    }

    async function settle(): Promise<void> {
        harness.detectChanges();
        await harness.fixture.whenStable();
        harness.detectChanges();
    }

    const el = (host: HTMLElement, testId: string) => host.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
    const button = (host: HTMLElement, testId: string) => host.querySelector(`[data-testid="${testId}"] button`) as HTMLButtonElement | null;
    const text = (host: HTMLElement, testId: string) => el(host, testId)?.textContent?.replace(/\s+/g, ' ').trim();
    const compact = (value: string | undefined) => value?.replace(/\s/g, ' ');

    beforeEach(() => {
        messages = jasmine.createSpy('add');
        confirm = jasmine.createSpy('confirm');
        TestBed.configureTestingModule({
            providers: [
                provideRouter([
                    { path: 'quotes/new', component: QuoteFormComponent },
                    { path: 'quotes/:id', component: QuoteFormComponent },
                    { path: 'quotes', component: QuoteFormComponent }
                ]),
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: MessageService, useValue: { add: messages } },
                { provide: ConfirmationService, useValue: { confirm } },
                { provide: CLOCK, useValue: () => new Date(2026, 10, 9, 12, 0) }
            ]
        });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    // ===== Un presupuesto nuevo =====

    it('a new quote starts without lines, asks for a customer and shows no number nor status', async () => {
        const host = await open('Owner', null);

        expect(text(host, 'quote-heading')).toBe('Nuevo presupuesto');
        expect(el(host, 'quote-status')).toBeNull();
        expect(el(host, 'quote-no-lines')).not.toBeNull();
        expect(button(host, 'quote-save')).not.toBeNull();
        expect(el(host, 'quote-send')).toBeNull(); // no se envía lo que aún no existe
        expect(el(host, 'quote-delete')).toBeNull();
    });

    it('saving an invalid form sends nothing and shows what is wrong', async () => {
        const host = await open('Owner', null);
        component.addLine();

        component.save();
        await settle();

        httpMock.expectNone(quotesUrl);
        expect(el(host, 'quote-customer-error')).not.toBeNull();
        expect(el(host, 'quote-title-error')).not.toBeNull();
        expect(el(host, 'line-description-error')).not.toBeNull();
        expect(el(host, 'line-price-error')).not.toBeNull(); // el precio de una línea nueva está vacío
        expect(messages).not.toHaveBeenCalled();
    });

    it('creates the quote with the price in whole cents, the customer chosen and NO calculated amount', async () => {
        const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
        await open('Owner', null);
        component.setCustomer('c1');
        component.title.set('  Reforma del baño  ');
        component.notes.set('Pago a 30 días');
        component.validUntil.set('2026-12-31');
        component.addLine();
        component.setLine(0, { description: ' Mano de obra ', quantity: 2.5, priceEuros: 12.34, vatPercent: 21 });

        component.save();

        const req = httpMock.expectOne(quotesUrl);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
            customerId: 'c1',
            jobId: null,
            title: 'Reforma del baño',
            notes: 'Pago a 30 días',
            validUntil: '2026-12-31',
            items: [{ description: 'Mano de obra', quantity: 2.5, unitPriceCents: 1234, vatPercent: 21 }]
        });
        req.flush({ id: 'q-9' }, { status: 201, statusText: 'Created' });
        expect(navigate).toHaveBeenCalledWith(['/quotes', 'q-9']);
        expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'success', summary: 'Presupuesto creado' }));
    });

    it('a failed creation shows the message of the API and keeps what was typed', async () => {
        await open('Owner', null);
        component.setCustomer('c1');
        component.title.set('Reforma');

        component.save();
        httpMock.expectOne(quotesUrl).flush({ status: 404, detail: 'No se ha encontrado el cliente.', code: 'customer.not_found' }, { status: 404, statusText: 'Not Found' });
        await settle();

        expect(component.errorMessage()).toBe('No se ha encontrado el cliente.');
        expect(component.title()).toBe('Reforma');
        expect(component.busy()).toBeFalse();
    });

    // ===== La vista previa y lo que manda el servidor =====

    it('shows the totals of the server for a saved quote, and a preview (labelled) as soon as it is edited', async () => {
        const host = await open('Owner');

        expect(compact(text(host, 'quote-total'))).toContain('87,33');
        expect(el(host, 'quote-preview-note')).toBeNull();
        expect(el(host, 'quote-breakdown')).not.toBeNull();

        component.setLine(0, { quantity: 3 });
        await settle();

        // 3 × 12,34 = 37,02 al 21 % → IVA 7,77; más 50 € al 0 %: neto 87,02, IVA 7,77, total 94,79.
        expect(compact(text(host, 'quote-total'))).toContain('94,79');
        expect(text(host, 'quote-preview-note')).toContain('Vista previa');
    });

    it('for a saved quote the totals shown are what the server says, even if they differ from the local calculation (the API is the only source of truth)', async () => {
        const host = await open('Owner', quote('Draft', { netCents: 10000, vatCents: 2345, totalCents: 12345, vatBreakdown: [{ vatPercent: 21, baseCents: 10000, vatCents: 2345 }] }));

        expect(compact(text(host, 'quote-total'))).toContain('123,45');
        expect(compact(text(host, 'quote-vat'))).toContain('23,45');
        expect(el(host, 'quote-preview-note')).toBeNull();
        expect(component.previewTotals().totalCents).toBe(8733); // lo que saldría localmente: no es lo que se enseña
    });

    it('the preview follows the same rule as the server: VAT once per rate, half cents away from zero', async () => {
        await open('Owner', null);
        component.setCustomer('c1');
        for (let i = 0; i < 5; i++) {
            component.addLine();
            component.setLine(i, { description: 'x', quantity: 1, priceEuros: 0.02, vatPercent: 21 });
        }

        // Cinco líneas de 0,02 € al 21 %: base 0,10, IVA 0,021 → 0,02 (si se redondeara por línea saldría 0,00).
        expect(component.previewTotals()).toEqual({ netCents: 10, vatCents: 2, totalCents: 12, breakdown: [{ vatPercent: 21, baseCents: 10, vatCents: 2 }] });
    });

    it('the net of each line is shown while editing', async () => {
        const host = await open('Owner');

        const nets = Array.from(host.querySelectorAll('[data-testid="line-net"]')).map((cell) => compact(cell.textContent?.trim()));

        expect(nets[0]).toContain('30,85');
        expect(nets[1]).toContain('50,00');
    });

    it('a line with an invalid number is left out of the preview instead of breaking it', async () => {
        await open('Owner');
        component.addLine();
        component.setLine(2, { description: 'Precio negativo', quantity: 1, priceEuros: -5 });

        // Un precio negativo restaría 5 € del total si la línea entrara en la vista previa: con el error, la línea no cuenta (y uno vacío sumaría 0 y no demostraría nada).
        expect(component.previewTotals().totalCents).toBe(8733);
        expect(component.lineErrors()[2].price).toBeDefined();
        component.setLine(2, { quantity: 0, priceEuros: 100 });
        expect(component.previewTotals().totalCents).toBe(8733); // una cantidad de cero tampoco entra: sumaría 0 pero con un precio de 100 € dejaría ver la línea
        expect(component.lineErrors()[2].quantity).toBeDefined();
    });

    // ===== Editar un borrador guardado =====

    it('loads the lines in the order of their position, not the order they arrived in', async () => {
        await open('Owner');

        expect(component.lines().map((line) => line.description)).toEqual(['Mano de obra', 'Material']);
        expect(component.lines()[0].priceEuros).toBe(12.34);
    });

    it('saves with the version it read, then asks again for what the API stored (and is clean again)', async () => {
        await open('Owner');
        component.title.set('Reforma completa');
        expect(component.dirty()).toBeTrue();

        component.save();
        const put = httpMock.expectOne(`${quotesUrl}/q-1`);
        expect(put.request.method).toBe('PUT');
        expect(put.request.body.version).toBe('VERSION-1');
        expect(put.request.body.title).toBe('Reforma completa');
        put.flush(null, { status: 204, statusText: 'No Content' });
        httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Draft', { title: 'Reforma completa', version: 'VERSION-2' }));
        await settle();

        expect(component.quote()?.version).toBe('VERSION-2');
        expect(component.dirty()).toBeFalse();
        expect(component.busy()).toBeFalse();
    });

    it('cannot be sent with unsaved changes (it would send what is stored), and can once saved', async () => {
        const host = await open('Owner');
        expect(button(host, 'quote-send')?.disabled).toBeFalse();

        component.title.set('Cambio sin guardar');
        await settle();

        expect(button(host, 'quote-send')?.disabled).toBeTrue();
        expect(text(host, 'quote-send-hint')).toContain('Guarda');
    });

    it('cannot be sent without lines', async () => {
        const host = await open('Owner', quote('Draft', { items: [], netCents: 0, vatCents: 0, totalCents: 0, vatBreakdown: [] }));

        expect(button(host, 'quote-send')?.disabled).toBeTrue();
    });

    // ===== El conflicto de versión =====

    async function conflict(): Promise<HTMLElement> {
        const host = await open('Owner');
        component.title.set('Mi título');
        component.save();
        httpMock.expectOne(`${quotesUrl}/q-1`).flush({ status: 400, detail: 'Alguien ha modificado este presupuesto.', code: 'quote.changed_meanwhile' }, { status: 400, statusText: 'Bad Request' });
        httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Draft', { title: 'Su título', version: 'VERSION-2' }));
        await settle();
        return host;
    }

    it('a stale version shows the conflict WITHOUT losing what was typed', async () => {
        const host = await conflict();

        expect(el(host, 'quote-conflict')).not.toBeNull();
        expect(component.title()).toBe('Mi título');
        expect(component.latest()?.version).toBe('VERSION-2');
        expect(component.busy()).toBeFalse();
    });

    it('«load theirs» replaces the screen with what is stored and clears the conflict', async () => {
        const host = await conflict();

        component.loadTheirs();
        await settle();

        expect(component.title()).toBe('Su título');
        expect(el(host, 'quote-conflict')).toBeNull();
        expect(component.dirty()).toBeFalse();
    });

    it('«keep mine» saves what is on screen with the NEW version', async () => {
        await conflict();

        component.keepMine();
        const put = httpMock.expectOne(`${quotesUrl}/q-1`);
        expect(put.request.body.version).toBe('VERSION-2');
        expect(put.request.body.title).toBe('Mi título');
        put.flush(null, { status: 204, statusText: 'No Content' });
        httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Draft', { title: 'Mi título', version: 'VERSION-3' }));
        await settle();

        expect(component.latest()).toBeNull();
        expect(component.quote()?.version).toBe('VERSION-3');
    });

    it('«keep mine» does not overwrite a quote that was sent in the meantime', async () => {
        await open('Owner');
        component.title.set('Mi título');
        component.save();
        httpMock.expectOne(`${quotesUrl}/q-1`).flush({ status: 400, detail: 'Cambió.', code: 'quote.changed_meanwhile' }, { status: 400, statusText: 'Bad Request' });
        httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Sent', { version: 'VERSION-2' }));
        await settle();

        component.keepMine();
        await settle();

        httpMock.expectNone(`${quotesUrl}/q-1`);
        expect(component.readOnly()).toBeTrue();
        expect(component.errorMessage()).toContain('ya no es un borrador');
    });

    it('any other error is shown with its message and no conflict banner', async () => {
        const host = await open('Owner');
        component.title.set('Cambio');

        component.save();
        httpMock.expectOne(`${quotesUrl}/q-1`).flush({ status: 400, detail: 'Solo se puede modificar un presupuesto en borrador.', code: 'quote.not_editable' }, { status: 400, statusText: 'Bad Request' });
        await settle();

        expect(component.errorMessage()).toBe('Solo se puede modificar un presupuesto en borrador.');
        expect(el(host, 'quote-conflict')).toBeNull();
    });

    // ===== Solo lectura =====

    for (const status of ['Sent', 'Accepted', 'Rejected'] as const) {
        it(`a ${status} quote is read-only: no save, no add, no remove, no delete`, async () => {
            const host = await open('Owner', quote(status));

            expect(component.readOnly()).toBeTrue();
            expect(el(host, 'quote-readonly')).not.toBeNull();
            expect(el(host, 'quote-save')).toBeNull();
            expect(el(host, 'quote-add-line')).toBeNull();
            expect(el(host, 'quote-delete')).toBeNull();
            expect(host.querySelectorAll('[aria-label="Quitar la línea"]').length).toBe(0);
            expect((host.querySelector('#quoteTitle') as HTMLInputElement).disabled).toBeTrue();
            expect(compact(text(host, 'quote-total'))).toContain('87,33');
        });
    }

    it('the methods that change lines do nothing in read-only mode, even if called by hand', async () => {
        await open('Owner', quote('Sent'));
        const before = JSON.stringify(component.lines());

        component.addLine();
        component.removeLine(0);
        component.moveLine(0, 1);
        component.setLine(0, { description: 'Reescrito' });

        expect(JSON.stringify(component.lines())).toBe(before);
    });

    it('saving does nothing in read-only mode', async () => {
        await open('Owner', quote('Accepted'));

        component.save();

        httpMock.expectNone(`${quotesUrl}/q-1`);
    });

    it('someone without Quotes.Write sees even a draft in read-only mode, with the reason', async () => {
        const host = await open('Employee', quote(), ['Quotes.Read', 'Customers.Read', 'Jobs.Read']);

        expect(component.readOnly()).toBeTrue();
        expect(text(host, 'quote-readonly')).toContain('No tienes permiso');
        expect(el(host, 'quote-save')).toBeNull();
    });

    // ===== Acciones sobre el estado =====

    it('a draft offers send (to Quotes.Issue), not accept nor reject', async () => {
        const host = await open('Owner', quote('Draft'));

        expect(el(host, 'quote-send')).not.toBeNull();
        expect(el(host, 'quote-accept')).toBeNull();
        expect(el(host, 'quote-reject')).toBeNull();
    });

    it('a sent quote offers accept and reject, not send', async () => {
        const host = await open('Owner', quote('Sent'));

        expect(el(host, 'quote-send')).toBeNull();
        expect(el(host, 'quote-accept')).not.toBeNull();
        expect(el(host, 'quote-reject')).not.toBeNull();
    });

    it('an Employee prepares but does not commit: edits a draft, with no send, accept or reject', async () => {
        const host = await open('Employee', quote('Draft'));

        expect(component.readOnly()).toBeFalse();
        expect(el(host, 'quote-save')).not.toBeNull();
        expect(el(host, 'quote-send')).toBeNull();
        expect(el(host, 'quote-accept')).toBeNull();
        expect(el(host, 'quote-reject')).toBeNull();
    });

    it('an Employee does not see accept or reject on a SENT quote either: deciding commits a price', async () => {
        const host = await open('Employee', quote('Sent'));

        expect(component.readOnly()).toBeTrue();
        expect(el(host, 'quote-accept')).toBeNull();
        expect(el(host, 'quote-reject')).toBeNull();
        expect(el(host, 'quote-send')).toBeNull();
    });

    it('a Manager (Quotes.Issue) can accept a sent quote', async () => {
        const host = await open('Manager', quote('Sent'));

        expect(el(host, 'quote-accept')).not.toBeNull();
    });

    function confirmed(): void {
        const options = confirm.calls.mostRecent().args[0] as { accept: () => void };
        options.accept();
    }

    it('sending asks first, then POSTs /send and asks again for the quote', async () => {
        await open('Owner', quote('Draft'));

        component.run('send');
        expect(confirm).toHaveBeenCalledTimes(1);
        httpMock.expectNone(`${quotesUrl}/q-1/send`); // nada hasta confirmar
        confirmed();
        const post = httpMock.expectOne(`${quotesUrl}/q-1/send`);
        expect(post.request.method).toBe('POST');
        post.flush(null, { status: 204, statusText: 'No Content' });
        httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Sent', { version: 'VERSION-2' }));
        await settle();

        expect(component.status()).toBe('Sent');
        expect(component.readOnly()).toBeTrue();
        expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'success', summary: 'Presupuesto enviado' }));
    });

    it('accepting and rejecting ask first and POST their own action', async () => {
        await open('Owner', quote('Sent'));

        component.run('accept');
        confirmed();
        httpMock.expectOne(`${quotesUrl}/q-1/accept`).flush(null, { status: 204, statusText: 'No Content' });
        httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Accepted'));
        await settle();
        expect(component.status()).toBe('Accepted');

        component.run('reject');
        confirmed();
        httpMock.expectOne(`${quotesUrl}/q-1/reject`).flush({ status: 400, detail: 'Solo se puede rechazar un presupuesto enviado.', code: 'quote.cannot_reject' }, { status: 400, statusText: 'Bad Request' });
        httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Accepted'));
        await settle();
        expect(component.errorMessage()).toBe('Solo se puede rechazar un presupuesto enviado.');
    });

    it('deleting asks first, then DELETEs and goes back to the list', async () => {
        const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
        await open('Owner', quote('Draft'));

        component.remove();
        expect(confirm).toHaveBeenCalledTimes(1);
        httpMock.expectNone(`${quotesUrl}/q-1`);
        confirmed();
        const del = httpMock.expectOne(`${quotesUrl}/q-1`);
        expect(del.request.method).toBe('DELETE');
        del.flush(null, { status: 204, statusText: 'No Content' });

        expect(navigate).toHaveBeenCalledWith(['/quotes']);
    });

    it('the text of a quote is escaped in the confirmation (it is shown as HTML)', async () => {
        await open('Owner', quote('Draft', { title: '<img src=x onerror=alert(1)>' }));

        component.remove();

        const options = confirm.calls.mostRecent().args[0] as { message: string };
        expect(options.message).not.toContain('<img');
        expect(options.message).toContain('&lt;img');
    });

    // ===== Líneas =====

    it('adds, moves and removes lines', async () => {
        await open('Owner', null);
        component.setCustomer('c1');
        component.addLine();
        component.addLine();
        component.addLine();
        component.setLine(0, { description: 'A' });
        component.setLine(1, { description: 'B' });
        component.setLine(2, { description: 'C' });

        component.moveLine(2, -1);
        expect(component.lines().map((l) => l.description)).toEqual(['A', 'C', 'B']);
        component.moveLine(0, -1); // el borde: no hace nada
        component.moveLine(2, 1);
        expect(component.lines().map((l) => l.description)).toEqual(['A', 'C', 'B']);
        component.removeLine(1);
        expect(component.lines().map((l) => l.description)).toEqual(['A', 'B']);
    });

    it('does not accept a line number 101', async () => {
        const host = await open('Owner', null);
        for (let i = 0; i < 101; i++) {
            component.addLine();
        }
        await settle();

        expect(component.lines().length).toBe(100);
        expect(component.canAddLine()).toBeFalse();
        expect(button(host, 'quote-add-line')?.disabled).toBeTrue();
    });

    it('validates each line: quantity, price and description, with the same limits as the API', async () => {
        await open('Owner', null);
        component.addLine();
        const errors = () => component.lineErrors()[0];

        component.setLine(0, { description: 'x', quantity: 0, priceEuros: 10 });
        expect(errors().quantity).toBeDefined();
        component.setLine(0, { quantity: 1.0001 });
        expect(errors().quantity).toContain('decimales');
        component.setLine(0, { quantity: 100000 });
        expect(errors().quantity).toBeDefined();
        component.setLine(0, { quantity: 99999.999 });
        expect(errors().quantity).toBeUndefined();
        component.setLine(0, { priceEuros: -1 });
        expect(errors().price).toBeDefined();
        component.setLine(0, { priceEuros: 100_000_000 });
        expect(errors().price).toBeDefined();
        component.setLine(0, { priceEuros: 99_999_999.99 });
        expect(errors().price).toBeUndefined();
        component.setLine(0, { priceEuros: 0 });
        expect(errors().price).toBeUndefined(); // un precio 0 vale: «incluido»
        component.setLine(0, { vatPercent: 13 });
        expect(errors().vat).toBeDefined();
        component.setLine(0, { vatPercent: 10, description: '   ' });
        expect(errors().description).toBeDefined();
        component.setLine(0, { description: 'd'.repeat(501) });
        expect(errors().description).toBeDefined();
    });

    it('validates the header: title required and limited, notes limited, validity within the years the API accepts', async () => {
        await open('Owner', null);
        component.title.set('   ');
        expect(component.headerErrors().title).toBeDefined();
        component.title.set('t'.repeat(201));
        expect(component.headerErrors().title).toBeDefined();
        component.title.set('t'.repeat(200));
        expect(component.headerErrors().title).toBeUndefined();
        component.notes.set('n'.repeat(2001));
        expect(component.headerErrors().notes).toBeDefined();
        component.validUntil.set('1999-12-31');
        expect(component.headerErrors().validUntil).toBeDefined();
        component.validUntil.set('2100-01-01');
        expect(component.headerErrors().validUntil).toBeDefined();
        component.validUntil.set('2026-05-05'); // una fecha pasada se admite: es informativa
        expect(component.headerErrors().validUntil).toBeUndefined();
    });

    // ===== El trabajo opcional y el cliente =====

    it('offers only the jobs of the chosen customer, and forgets the job when the customer changes', async () => {
        await open('Owner', null);

        component.setCustomer('c1');
        expect(component.jobOptions()).toEqual([{ label: 'Trabajo de Ana', value: 'j1' }]);
        component.jobId.set('j1');
        component.setCustomer('c2');

        expect(component.jobOptions()).toEqual([{ label: 'Trabajo de Luis', value: 'j2' }]);
        expect(component.jobId()).toBeNull();
    });

    it('without Jobs.Read the job is not offered and no jobs are requested', async () => {
        const host = await open('Owner', null, ['Quotes.Read', 'Quotes.Write', 'Customers.Read']);

        expect(host.querySelector('#quoteJob')).toBeNull();
        expect(component.canChooseJob()).toBeFalse();
    });

    it('the customer of a saved quote is shown as text and cannot be changed', async () => {
        const host = await open('Owner');

        expect(text(host, 'quote-customer-name')).toBe('Ana Ruiz');
        expect(host.querySelector('#quoteCustomer')).toBeNull();
    });

    // ===== Cabecera y errores de carga =====

    it('shows the number and the status in the heading, and «Caducado» for a draft whose validity has passed', async () => {
        const host = await open('Owner', quote('Draft', { validUntil: '2026-11-01' }));

        expect(text(host, 'quote-heading')).toBe('Presupuesto P-0012');
        expect(text(host, 'quote-status')).toBe('Borrador');
        expect(el(host, 'quote-expired')).not.toBeNull();
    });

    it('an accepted quote never shows «Caducado», however old its validity', async () => {
        const host = await open('Owner', quote('Accepted', { validUntil: '2020-01-01' }));

        expect(el(host, 'quote-expired')).toBeNull();
    });

    it('a quote that does not load shows the message of the API and no form to save', async () => {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount({ role: 'Owner' }));
        harness = await RouterTestingHarness.create();
        component = await harness.navigateByUrl('/quotes/q-1', QuoteFormComponent);
        httpMock.expectOne(customersUrl).flush([]);
        httpMock.expectOne(jobsUrl).flush([]);
        httpMock.expectOne(`${quotesUrl}/q-1`).flush({ status: 404, detail: 'No se ha encontrado el presupuesto.', code: 'quote.not_found' }, { status: 404, statusText: 'Not Found' });
        await settle();

        expect(component.errorMessage()).toBe('No se ha encontrado el presupuesto.');
        expect(component.quote()).toBeNull();
    });

    it('a double click on save sends one request while the first is in flight', async () => {
        await open('Owner');
        component.title.set('Cambio');

        component.save();
        component.save();

        expect(httpMock.match(`${quotesUrl}/q-1`).length).toBe(1);
    });
});
