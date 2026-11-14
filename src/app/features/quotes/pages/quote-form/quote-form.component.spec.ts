import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../../../environments/environment';
import { CLOCK } from '../../../../core/services/clock';
import { authInterceptor } from '../../../../core/interceptors/auth.interceptor';
import { AuthService } from '../../../../core/services/auth';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { FileDownloadService } from '../../../../core/services/file-download';
import { buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { TenantRole } from '../../../../shared/models/auth.model';
import { CompanyProfile, EMPTY_COMPANY_PROFILE } from '../../../../shared/models/company-profile.model';
import { Quote, QuoteStatus } from '../../../../shared/models/quote.model';
import { QuoteFormComponent, formatWait } from './quote-form.component';

const quotesUrl = `${environment.apiUrl}/quotes`;
const customersUrl = `${environment.apiUrl}/customers`;
const jobsUrl = `${environment.apiUrl}/jobs`;
const companyUrl = `${environment.apiUrl}/company/profile`;
const pdfUrl = `${quotesUrl}/q-1/pdf`;

const completeProfile: CompanyProfile = { legalName: 'Marta Gil Pérez', taxId: '12345678Z', addressLine: 'Calle Mayor 1', postalCode: '28001', city: 'Madrid', province: null, phone: null, email: null, isComplete: true };

const customer = (id: string, name: string, email: string | null = null) => ({ id, type: 'Person', name, email, phone: null, address: null, notes: null });
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
    emailedAt: null,
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
    let saveFile: jasmine.Spy;
    // El email de la ficha del cliente c1 en este test (spec 026: se propone como dirección al mandar el presupuesto por correo).
    let customerEmail: string | null = null;

    // Abre /quotes/new o /quotes/q-1 con el rol indicado y responde a las peticiones de la carga.
    // El interceptor (que está en los providers para que el error de una descarga llegue como en producción) lee el token de AuthService: se guarda ahí también.
    function signIn(): CurrentSessionService {
        const token = buildSessionToken();
        TestBed.inject(AuthService).storeSession({ accessToken: token, refreshToken: 'refresh-1', expiresAt: '' });
        const session = TestBed.inject(CurrentSessionService);
        session.establish(token);
        return session;
    }

    async function open(role: TenantRole, loaded: Quote | null = quote(), permissions?: string[], company: CompanyProfile | 'fails' = completeProfile): Promise<HTMLElement> {
        const session = signIn();
        session.setAccount(buildAccount({ role, ...(permissions ? { permissions } : {}) }));

        harness = await RouterTestingHarness.create();
        component = await harness.navigateByUrl(loaded ? '/quotes/q-1' : '/quotes/new', QuoteFormComponent);
        if (session.can('Customers.Read')) {
            httpMock.expectOne(customersUrl).flush([customer('c1', 'Ana Ruiz', customerEmail), customer('c2', 'Luis Gómez')]);
        }
        if (session.can('Jobs.Read')) {
            httpMock.expectOne(jobsUrl).flush([job('j1', 'c1', 'Trabajo de Ana'), job('j2', 'c2', 'Trabajo de Luis')]);
        }
        if (loaded) {
            httpMock.expectOne(`${quotesUrl}/q-1`).flush(loaded);
            // Un presupuesto que ya existe pregunta también si la empresa tiene sus datos fiscales (para avisar antes de intentar el PDF).
            if (session.can('Quotes.Read') && session.can('Company.Read')) {
                const request = httpMock.expectOne(companyUrl);
                if (company === 'fails') {
                    request.flush({ status: 500, detail: 'Error.' }, { status: 500, statusText: 'Server Error' });
                } else {
                    request.flush(company);
                }
            }
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
        customerEmail = null;
        messages = jasmine.createSpy('add');
        confirm = jasmine.createSpy('confirm');
        saveFile = jasmine.createSpy('save');
        TestBed.configureTestingModule({
            providers: [
                provideRouter([
                    { path: 'quotes/new', component: QuoteFormComponent },
                    { path: 'quotes/:id', component: QuoteFormComponent },
                    { path: 'quotes', component: QuoteFormComponent }
                ]),
                provideHttpClient(withInterceptors([authInterceptor])),
                provideHttpClientTesting(),
                { provide: FileDownloadService, useValue: { save: saveFile } },
                { provide: MessageService, useValue: { add: messages } },
                { provide: ConfirmationService, useValue: { confirm } },
                { provide: CLOCK, useValue: () => new Date(2026, 10, 9, 12, 0) }
            ]
        });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

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
        const session = signIn();
        session.setAccount(buildAccount({ role: 'Owner' }));
        harness = await RouterTestingHarness.create();
        component = await harness.navigateByUrl('/quotes/q-1', QuoteFormComponent);
        httpMock.expectOne(customersUrl).flush([]);
        httpMock.expectOne(jobsUrl).flush([]);
        httpMock.expectOne(`${quotesUrl}/q-1`).flush({ status: 404, detail: 'No se ha encontrado el presupuesto.', code: 'quote.not_found' }, { status: 404, statusText: 'Not Found' });
        httpMock.expectOne(companyUrl).flush(completeProfile);
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

    // ===== El PDF (spec 025) =====

    const pdfBlob = () => new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    const disposition = (name: string) => ({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename=${name}` });
    const problemBlob = (body: unknown) => new Blob([JSON.stringify(body)], { type: 'application/problem+json' });
    // Leer el Blob de un error es asíncrono: se espera a que la pantalla haya recibido la respuesta, no un tiempo fijo.
    const untilDone = async () => {
        for (let i = 0; i < 400 && component.downloadingPdf(); i++) {
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
    };

    describe('the pdf button', () => {
        it('is offered for a saved quote to whoever can read quotes (Owner and Employee)', async () => {
            for (const role of ['Owner', 'Employee'] as TenantRole[]) {
                const host = await open(role, quote('Sent'));

                expect(button(host, 'quote-pdf'))
                    .withContext(role)
                    .not.toBeNull();
                expect(button(host, 'quote-pdf')?.disabled).withContext(role).toBeFalse();
                TestBed.resetTestingModule();
                TestBed.configureTestingModule({
                    providers: [
                        provideRouter([{ path: 'quotes/:id', component: QuoteFormComponent }]),
                        provideHttpClient(withInterceptors([authInterceptor])),
                        provideHttpClientTesting(),
                        { provide: FileDownloadService, useValue: { save: saveFile } },
                        { provide: MessageService, useValue: { add: messages } },
                        { provide: ConfirmationService, useValue: { confirm } },
                        { provide: CLOCK, useValue: () => new Date(2026, 10, 9, 12, 0) }
                    ]
                });
                httpMock = TestBed.inject(HttpTestingController);
            }
        });

        it('is not offered for a quote that does not exist yet', async () => {
            const host = await open('Owner', null);

            expect(el(host, 'quote-pdf')).toBeNull();
        });

        it('is not offered to a role without permission to read quotes, and nothing is asked about the company', async () => {
            const host = await open('Employee', quote(), ['Customers.Read']);

            expect(el(host, 'quote-pdf')).toBeNull();
            expect(el(host, 'quote-profile-notice')).toBeNull();
        });

        it('downloads the saved quote and hands the file to the browser with the name that the API gave', async () => {
            const host = await open('Owner', quote('Sent', { number: 12 }));

            component.downloadPdf();
            const req = httpMock.expectOne(pdfUrl);
            expect(req.request.method).toBe('GET');
            expect(req.request.responseType).toBe('blob');
            req.flush(pdfBlob(), { headers: disposition('presupuesto-P-0099.pdf') });
            await settle();

            expect(saveFile).toHaveBeenCalledTimes(1);
            // El nombre que dijo la API (P-0099), no el que se construiría con el número del presupuesto (P-0012).
            expect(saveFile.calls.mostRecent().args[1]).toBe('presupuesto-P-0099.pdf');
            expect((saveFile.calls.mostRecent().args[0] as Blob).type).toBe('application/pdf');
            expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'success', summary: 'PDF generado', detail: 'presupuesto-P-0099.pdf' }));
            expect(button(host, 'quote-pdf')?.disabled).toBeFalse();
            expect(component.errorMessage()).toBeNull();
        });

        it('builds the same name from the number when the API name cannot be read', async () => {
            await open('Owner', quote('Sent', { number: 7 }));

            component.downloadPdf();
            httpMock.expectOne(pdfUrl).flush(pdfBlob(), { headers: { 'Content-Type': 'application/pdf' } });
            await settle();

            expect(saveFile.calls.mostRecent().args[1]).toBe('presupuesto-P-0007.pdf');
        });

        it('never uses a file name from outside that is not the expected shape', async () => {
            await open('Owner', quote('Sent', { number: 12 }));

            component.downloadPdf();
            httpMock.expectOne(pdfUrl).flush(pdfBlob(), { headers: disposition('../../etc/passwd') });
            await settle();

            expect(saveFile.calls.mostRecent().args[1]).toBe('presupuesto-P-0012.pdf');
        });

        it('while it generates the button says so and is disabled; afterwards it comes back', async () => {
            const host = await open('Owner', quote('Sent'));

            component.downloadPdf();
            await settle();
            expect(component.downloadingPdf()).toBeTrue();
            expect(button(host, 'quote-pdf')?.disabled).toBeTrue();
            expect(text(host, 'quote-pdf')).toContain('Generando');

            httpMock.expectOne(pdfUrl).flush(pdfBlob(), { headers: disposition('presupuesto-P-0012.pdf') });
            await settle();

            expect(component.downloadingPdf()).toBeFalse();
            expect(button(host, 'quote-pdf')?.disabled).toBeFalse();
            expect(text(host, 'quote-pdf')).toContain('Descargar PDF');
        });

        it('sends exactly one request for two quick clicks', async () => {
            await open('Owner', quote('Sent'));

            component.downloadPdf();
            component.downloadPdf();

            expect(httpMock.match(pdfUrl).length).toBe(1);
        });

        it('is disabled with unsaved changes, with a hint to save first, and nothing is sent', async () => {
            const host = await open('Owner', quote('Draft'));
            component.title.set('Cambio sin guardar');
            await settle();

            expect(button(host, 'quote-pdf')?.disabled).toBeTrue();
            expect(el(host, 'quote-pdf-hint')).not.toBeNull();
            component.downloadPdf();
            httpMock.expectNone(pdfUrl);
        });

        it('says that the pdf of a draft carries the DRAFT mark, and a sent quote does not say it', async () => {
            const draft = await open('Owner', quote('Draft'));
            expect(el(draft, 'quote-pdf-draft-note')).not.toBeNull();
            expect(el(draft, 'quote-pdf-hint')).toBeNull();
        });

        it('a sent quote has no note about the draft mark', async () => {
            const host = await open('Owner', quote('Sent'));

            expect(el(host, 'quote-pdf-draft-note')).toBeNull();
        });

        it('is disabled while another action is running', async () => {
            const host = await open('Owner', quote('Draft'));
            component.busy.set(true);
            await settle();

            expect(button(host, 'quote-pdf')?.disabled).toBeTrue();
            component.downloadPdf();
            httpMock.expectNone(pdfUrl);
        });

        it('asks nothing about the company when the role can read quotes but not the company data (the warning is only for those who can see it)', async () => {
            const host = await open('Manager', quote('Sent'), ['Quotes.Read', 'Customers.Read']);

            expect(el(host, 'quote-pdf')).not.toBeNull();
            httpMock.expectNone(companyUrl);
            expect(el(host, 'quote-profile-notice')).toBeNull();
        });

        it('asks nothing about the company when the pdf is not offered, even if the role could see the company data', async () => {
            const host = await open('Manager', quote('Sent'), ['Company.Read', 'Customers.Read']);

            expect(el(host, 'quote-pdf')).toBeNull();
            httpMock.expectNone(companyUrl);
        });

        it('does not keep the file in any browser storage', async () => {
            await open('Owner', quote('Sent'));
            const before = JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } });

            component.downloadPdf();
            httpMock.expectOne(pdfUrl).flush(pdfBlob(), { headers: disposition('presupuesto-P-0012.pdf') });
            await settle();

            expect(JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })).toBe(before);
        });
    });

    describe('when the company has no fiscal data', () => {
        it('warns on load, before any attempt, and the owner gets the link to the company data', async () => {
            const host = await open('Owner', quote('Sent'), undefined, EMPTY_COMPANY_PROFILE);

            expect(el(host, 'quote-profile-notice')).not.toBeNull();
            expect((el(host, 'quote-profile-link') as HTMLAnchorElement | null)?.getAttribute('href')).toBe('/company');
            expect(el(host, 'quote-profile-ask')).toBeNull();
        });

        it('asks a role that cannot manage the company data to ask an administrator, without a link', async () => {
            const host = await open('Employee', quote('Sent'), undefined, EMPTY_COMPANY_PROFILE);

            expect(el(host, 'quote-profile-notice')).not.toBeNull();
            expect(text(host, 'quote-profile-ask')).toContain('administrador');
            expect(el(host, 'quote-profile-link')).toBeNull();
        });

        it('shows no warning when the data are complete', async () => {
            const host = await open('Owner', quote('Sent'));

            expect(el(host, 'quote-profile-notice')).toBeNull();
        });

        it('shows no warning when it could not be asked (the answer failed)', async () => {
            const host = await open('Owner', quote('Sent'), undefined, 'fails');

            expect(el(host, 'quote-profile-notice')).toBeNull();
            expect(component.profileComplete()).toBeNull();
        });

        it('does not ask for the company data on a new quote', async () => {
            const host = await open('Owner', null);

            httpMock.expectNone(companyUrl);
            expect(el(host, 'quote-profile-notice')).toBeNull();
        });

        it('turns the API answer «incomplete data» into the same warning, not into a loose error', async () => {
            const host = await open('Owner', quote('Sent'));
            expect(el(host, 'quote-profile-notice')).toBeNull();

            component.downloadPdf();
            httpMock.expectOne(pdfUrl).flush(problemBlob({ status: 400, code: 'quote.company_profile_incomplete', detail: 'Para generar el PDF hay que completar antes los datos de la empresa.' }), { status: 400, statusText: 'Bad Request' });
            await untilDone();
            await settle();

            expect(el(host, 'quote-profile-notice')).not.toBeNull();
            expect(el(host, 'quote-error')).toBeNull();
            expect(saveFile).not.toHaveBeenCalled();
            expect(button(host, 'quote-pdf')?.disabled).toBeFalse();
            expect(component.downloadingPdf()).toBeFalse();
        });
    });

    describe('when the download fails', () => {
        it('shows the text of the API for a quote that no longer exists and lets the person try again', async () => {
            const host = await open('Owner', quote('Sent'));

            component.downloadPdf();
            httpMock.expectOne(pdfUrl).flush(problemBlob({ status: 404, code: 'quote.not_found', detail: 'No se ha encontrado el presupuesto.' }), { status: 404, statusText: 'Not Found' });
            await untilDone();
            await settle();

            expect(text(host, 'quote-error')).toBe('No se ha encontrado el presupuesto.');
            expect(saveFile).not.toHaveBeenCalled();
            expect(button(host, 'quote-pdf')?.disabled).toBeFalse();
        });

        it('shows the text of the API when too many downloads were asked for', async () => {
            const host = await open('Owner', quote('Sent'));

            component.downloadPdf();
            httpMock.expectOne(pdfUrl).flush(problemBlob({ status: 429, code: 'rate_limit.exceeded', detail: 'Demasiadas peticiones. Espera un momento.' }), { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '30' } });
            await untilDone();
            await settle();

            expect(text(host, 'quote-error')).toBe('Demasiadas peticiones. Espera un momento.');
            expect(button(host, 'quote-pdf')?.disabled).toBeFalse();
        });

        it('shows a fallback message when the answer is not JSON (a proxy)', async () => {
            const host = await open('Owner', quote('Sent'));

            component.downloadPdf();
            httpMock.expectOne(pdfUrl).flush(new Blob(['<html>Bad gateway</html>'], { type: 'text/html' }), { status: 502, statusText: 'Bad Gateway' });
            await untilDone();
            await settle();

            expect(el(host, 'quote-error')).not.toBeNull();
            expect(text(host, 'quote-error')).not.toContain('<html>');
            expect(saveFile).not.toHaveBeenCalled();
        });

        it('shows the network message when there is no connection', async () => {
            const host = await open('Owner', quote('Sent'));

            component.downloadPdf();
            httpMock.expectOne(pdfUrl).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
            await settle();

            expect(el(host, 'quote-error')).not.toBeNull();
            expect(saveFile).not.toHaveBeenCalled();
            expect(button(host, 'quote-pdf')?.disabled).toBeFalse();
        });

        it('never hands a file that is not a pdf to the browser', async () => {
            const host = await open('Owner', quote('Sent'));

            component.downloadPdf();
            httpMock.expectOne(pdfUrl).flush(new Blob(['<html>login</html>'], { type: 'text/html' }), { headers: { 'Content-Type': 'text/html' } });
            await settle();

            expect(saveFile).not.toHaveBeenCalled();
            expect(el(host, 'quote-error')).not.toBeNull();
        });

        it('clears an old error when a new download starts', async () => {
            const host = await open('Owner', quote('Sent'));
            component.downloadPdf();
            httpMock.expectOne(pdfUrl).flush(problemBlob({ status: 404, code: 'quote.not_found', detail: 'Antiguo.' }), { status: 404, statusText: 'Not Found' });
            await untilDone();
            await settle();
            expect(el(host, 'quote-error')).not.toBeNull();

            component.downloadPdf();
            await settle();

            expect(el(host, 'quote-error')).toBeNull();
            httpMock.expectOne(pdfUrl).flush(pdfBlob(), { headers: disposition('presupuesto-P-0012.pdf') });
        });
    });

    describe('mailing the quote (spec 026)', () => {
        const emailUrl = `${quotesUrl}/q-1/email`;
        const ana = 'ana.cliente@ejemplo.es';

        const openDialog = async (host: HTMLElement) => {
            button(host, 'quote-email')?.click();
            await settle();
        };

        const typeAddress = async (host: HTMLElement, value: string) => {
            const input = el(host, 'quote-email-recipient') as HTMLInputElement;
            input.value = value;
            input.dispatchEvent(new Event('input'));
            await settle();
        };

        const clickSend = async (host: HTMLElement) => {
            button(host, 'quote-email-send')?.click();
            await settle();
        };

        const apiProblem = (status: number, code: string, detail: string) => ({ status, code, detail });

        beforeEach(() => {
            customerEmail = ana;
        });

        describe('who is offered it', () => {
            it('a saved quote offers it to whoever can issue quotes: Owner and Manager, draft or sent', async () => {
                for (const role of ['Owner', 'Manager'] as TenantRole[]) {
                    for (const status of ['Draft', 'Sent'] as QuoteStatus[]) {
                        const host = await open(role, quote(status));

                        expect(button(host, 'quote-email')).withContext(`${role} ${status}`).not.toBeNull();
                        expect(button(host, 'quote-email')?.disabled).withContext(`${role} ${status}`).toBeFalse();
                        TestBed.resetTestingModule();
                        TestBed.configureTestingModule({
                            providers: [
                                provideRouter([{ path: 'quotes/:id', component: QuoteFormComponent }]),
                                provideHttpClient(withInterceptors([authInterceptor])),
                                provideHttpClientTesting(),
                                { provide: FileDownloadService, useValue: { save: saveFile } },
                                { provide: MessageService, useValue: { add: messages } },
                                { provide: ConfirmationService, useValue: { confirm } },
                                { provide: CLOCK, useValue: () => new Date(2026, 10, 9, 12, 0) }
                            ]
                        });
                        httpMock = TestBed.inject(HttpTestingController);
                    }
                }
            });

            it('an Employee prepares and downloads the PDF but cannot mail it: committing a price is for Quotes.Issue', async () => {
                const host = await open('Employee', quote('Sent'));

                expect(el(host, 'quote-email')).toBeNull();
                expect(button(host, 'quote-pdf')).not.toBeNull();
            });

            it('is not offered for a quote that does not exist yet', async () => {
                const host = await open('Owner', null);

                expect(el(host, 'quote-email')).toBeNull();
            });

            it('even called directly, a role without Quotes.Issue sends nothing (the API would refuse it, but nothing is asked)', async () => {
                await open('Employee', quote('Sent'));
                component.emailRecipient.set('cliente@ejemplo.es');

                component.sendEmail();

                expect(component.sendingEmail()).toBeFalse();
            });
        });

        describe('the dialog', () => {
            it('opens with the address of the customer card, which can be changed for this mailing', async () => {
                const host = await open('Owner', quote('Sent'));

                await openDialog(host);

                expect(el(host, 'quote-email-dialog')).not.toBeNull();
                expect((el(host, 'quote-email-recipient') as HTMLInputElement).value).toBe(ana);
                expect(el(host, 'quote-email-no-customer-email')).toBeNull();
                // La dirección es el dato de un tercero: el navegador no la recuerda para otros formularios.
                expect((el(host, 'quote-email-recipient') as HTMLInputElement).autocomplete).toBe('off');

                await typeAddress(host, 'otro.contacto@ejemplo.es');
                expect(component.emailRecipient()).toBe('otro.contacto@ejemplo.es');
            });

            it('proposes the address of the customer OF THE QUOTE, not the first one in the list', async () => {
                // c1 (el primero de la lista) tiene email; el presupuesto es de c2, que no tiene: el campo empieza vacío.
                const host = await open('Owner', quote('Sent', { customerId: 'c2', customerName: 'Luis Gómez' }));

                await openDialog(host);

                expect((el(host, 'quote-email-recipient') as HTMLInputElement).value).toBe('');
            });

            it('starts empty, with a hint, when the customer has no email', async () => {
                customerEmail = null;
                const host = await open('Owner', quote('Sent'));

                await openDialog(host);

                expect((el(host, 'quote-email-recipient') as HTMLInputElement).value).toBe('');
                expect(el(host, 'quote-email-no-customer-email')).not.toBeNull();
            });

            it('starts empty when the role cannot read customers (the address of the card is not known)', async () => {
                const host = await open('Manager', quote('Sent'), ['Quotes.Read', 'Quotes.Issue', 'Company.Read']);

                await openDialog(host);

                expect((el(host, 'quote-email-recipient') as HTMLInputElement).value).toBe('');
            });

            it('says that the PDF of a draft carries the DRAFT mark, and a sent quote does not say it', async () => {
                const draft = await open('Owner', quote('Draft'));
                await openDialog(draft);
                expect(el(draft, 'quote-email-draft-note')).not.toBeNull();
                TestBed.resetTestingModule();
                TestBed.configureTestingModule({
                    providers: [
                        provideRouter([{ path: 'quotes/:id', component: QuoteFormComponent }]),
                        provideHttpClient(withInterceptors([authInterceptor])),
                        provideHttpClientTesting(),
                        { provide: FileDownloadService, useValue: { save: saveFile } },
                        { provide: MessageService, useValue: { add: messages } },
                        { provide: ConfirmationService, useValue: { confirm } },
                        { provide: CLOCK, useValue: () => new Date(2026, 10, 9, 12, 0) }
                    ]
                });
                httpMock = TestBed.inject(HttpTestingController);

                const sent = await open('Owner', quote('Sent'));
                await openDialog(sent);
                expect(el(sent, 'quote-email-draft-note')).toBeNull();
            });

            it('forgets the address when it is closed, and proposes the one of the card again when it is opened again', async () => {
                const host = await open('Owner', quote('Sent'));
                await openDialog(host);
                await typeAddress(host, 'borrar.esto@ejemplo.es');

                button(host, 'quote-email-cancel')?.click();
                await settle();

                expect(component.emailOpen()).toBeFalse();
                expect(component.emailRecipient()).toBe('');
                await openDialog(host);
                expect((el(host, 'quote-email-recipient') as HTMLInputElement).value).toBe(ana);
            });

            it('limits the length of the field to the 254 characters of an address', async () => {
                const host = await open('Owner', quote('Sent'));
                await openDialog(host);

                expect((el(host, 'quote-email-recipient') as HTMLInputElement).maxLength).toBe(254);
            });
        });

        describe('before sending', () => {
            it('is disabled with unsaved changes, with a hint to save first, and nothing opens', async () => {
                const host = await open('Owner', quote('Draft'));
                component.setLine(0, { description: 'Cambiada' });
                await settle();

                expect(button(host, 'quote-email')?.disabled).toBeTrue();
                expect(text(host, 'quote-email-hint')).toBe('Guarda los cambios antes de mandarlo por correo.');
                component.openEmail();
                expect(component.emailOpen()).toBeFalse();
            });

            it('is disabled while another action is running', async () => {
                const host = await open('Owner', quote('Draft'));
                component.busy.set(true);
                await settle();

                expect(button(host, 'quote-email')?.disabled).toBeTrue();
            });

            it('refuses an invalid address without any request, and says so', async () => {
                const host = await open('Owner', quote('Sent'));
                await openDialog(host);

                for (const hostile of ['', '   ', 'sin-arroba', 'uno@ejemplo.es, dos@ejemplo.es', 'uno@ejemplo.es;dos@ejemplo.es', 'Ana <ana@ejemplo.es>', 'a b@ejemplo.es', '"ana"@ejemplo.es', 'ana@ejemplo.es\nBcc: x@y.z']) {
                    await typeAddress(host, hostile);
                    await clickSend(host);

                    expect(el(host, 'quote-email-recipient-error')).withContext(hostile).not.toBeNull();
                }
                // httpMock.verify() de afterEach: ninguna petición salió.
                expect(component.sendingEmail()).toBeFalse();
            });

            it('refuses an address of 255 characters and accepts one of 254', async () => {
                const host = await open('Owner', quote('Sent'));
                await openDialog(host);
                const tail = '@ejemplo.es';

                component.emailRecipient.set('a'.repeat(255 - tail.length) + tail);
                expect(component.recipientValid()).toBeFalse();
                component.emailRecipient.set('a'.repeat(254 - tail.length) + tail);
                expect(component.recipientValid()).toBeTrue();
                component.emailOpen.set(false);
                await settle();
            });
        });

        describe('sending', () => {
            it('POSTs only the address to the email route of the quote, and nothing else', async () => {
                const host = await open('Owner', quote('Sent'));
                await openDialog(host);
                await typeAddress(host, '  cliente.final@ejemplo.es  ');

                await clickSend(host);

                const req = httpMock.expectOne(emailUrl);
                expect(req.request.method).toBe('POST');
                expect(req.request.body).toEqual({ recipient: 'cliente.final@ejemplo.es' });
                expect(req.request.params.keys().length).toBe(0);
                expect(req.request.url).not.toContain('ejemplo');
                expect(req.request.url).not.toContain('token');
                req.flush({ emailedAt: '2026-11-14T12:30:00Z' });
                httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Sent'));
                await settle();
            });

            it('on success closes the dialog, says so, asks again for the quote and shows when it was mailed', async () => {
                const host = await open('Owner', quote('Sent'));
                expect(el(host, 'quote-emailed')).toBeNull();
                await openDialog(host);

                await clickSend(host);
                httpMock.expectOne(emailUrl).flush({ emailedAt: '2026-11-14T12:30:00Z' });
                // Anotar el envío cambia la versión de fila: se vuelve a leer el presupuesto en vez de suponer nada.
                httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Sent', { emailedAt: '2026-11-14T12:30:00Z', version: 'VERSION-2' }));
                await settle();

                expect(component.emailOpen()).toBeFalse();
                expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'success', summary: 'Presupuesto enviado por correo', detail: 'P-0012' }));
                expect(component.quote()?.version).toBe('VERSION-2');
                expect(text(host, 'quote-emailed')).toMatch(/^Enviado por correo el \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
                expect(component.emailRecipient()).toBe('');
            });

            it('never shows the address in the toast, and does not keep it in any browser storage', async () => {
                const host = await open('Owner', quote('Sent'));
                await openDialog(host);
                await typeAddress(host, 'dato.personal.ajeno@ejemplo.es');
                await clickSend(host);
                httpMock.expectOne(emailUrl).flush({ emailedAt: '2026-11-14T12:30:00Z' });
                httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Sent'));
                await settle();

                expect(JSON.stringify(messages.calls.allArgs())).not.toContain('dato.personal.ajeno');
                for (const storage of [localStorage, sessionStorage]) {
                    for (let i = 0; i < storage.length; i++) {
                        expect(storage.getItem(storage.key(i) as string)).not.toContain('dato.personal.ajeno');
                    }
                }
                expect(host.textContent).not.toContain('dato.personal.ajeno');
            });

            it('sends exactly one request for two quick clicks, and the button says it is sending', async () => {
                const host = await open('Owner', quote('Sent'));
                await openDialog(host);

                await clickSend(host);
                expect(text(host, 'quote-email-send')).toContain('Enviando');
                expect(button(host, 'quote-email-send')?.disabled).toBeTrue();
                component.sendEmail();
                component.sendEmail();

                httpMock.expectOne(emailUrl).flush({ emailedAt: '2026-11-14T12:30:00Z' });
                httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Sent'));
                await settle();
            });

            it('does not close while it is sending: the result would be lost', async () => {
                const host = await open('Owner', quote('Sent'));
                await openDialog(host);
                await clickSend(host);

                component.closeEmail();
                await settle();

                expect(component.emailOpen()).toBeTrue();
                expect(button(host, 'quote-email-cancel')?.disabled).toBeTrue();
                // Y la x del diálogo desaparece mientras envía: no hay un segundo camino para cerrarlo.
                expect(host.querySelector('.p-dialog-close-button')).toBeNull();
                httpMock.expectOne(emailUrl).flush({ emailedAt: '2026-11-14T12:30:00Z' });
                httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Sent'));
                await settle();
            });

            it('Enter in the field sends too', async () => {
                const host = await open('Owner', quote('Sent'));
                await openDialog(host);

                (el(host, 'quote-email-recipient') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
                await settle();

                expect(component.sendingEmail()).toBeTrue();
                httpMock.expectOne(emailUrl).flush({ emailedAt: '2026-11-14T12:30:00Z' });
                httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Sent'));
                await settle();
            });
        });

        describe('when it fails', () => {
            const failWith = async (host: HTMLElement, status: number, code: string, detail: string, headers: Record<string, string> = {}) => {
                await openDialog(host);
                await clickSend(host);
                httpMock.expectOne(emailUrl).flush(apiProblem(status, code, detail), { status, statusText: 'Error', headers });
                await settle();
            };

            it('shows the text of the API when the mail server is not configured, keeps the dialog open and the address', async () => {
                const host = await open('Owner', quote('Sent'));

                await failWith(host, 400, 'quote.email_disabled', 'El envío por correo no está configurado en este servidor.');

                expect(text(host, 'quote-email-error')).toBe('El envío por correo no está configurado en este servidor.');
                expect(el(host, 'quote-email-dialog')).not.toBeNull();
                expect((el(host, 'quote-email-recipient') as HTMLInputElement).value).toBe(ana);
                expect(button(host, 'quote-email-send')?.disabled).toBeFalse();
                expect(component.quote()?.emailedAt).toBeNull();
            });

            it('shows the text of the API for a quote without lines', async () => {
                const host = await open('Owner', quote('Draft'));

                await failWith(host, 400, 'quote.email_requires_items', 'Un presupuesto sin líneas no se puede mandar por correo.');

                expect(text(host, 'quote-email-error')).toBe('Un presupuesto sin líneas no se puede mandar por correo.');
            });

            it('shows the text of the API when the mail server did not accept it, and lets the person try again', async () => {
                const host = await open('Owner', quote('Sent'));

                await failWith(host, 502, 'quote.email_not_sent', 'No se ha podido mandar el presupuesto por correo. Inténtalo de nuevo.');
                expect(text(host, 'quote-email-error')).toBe('No se ha podido mandar el presupuesto por correo. Inténtalo de nuevo.');

                // Una vez más: el aviso viejo se borra al empezar y esta vez sale.
                await clickSend(host);
                expect(el(host, 'quote-email-error')).toBeNull();
                httpMock.expectOne(emailUrl).flush({ emailedAt: '2026-11-14T12:30:00Z' });
                httpMock.expectOne(`${quotesUrl}/q-1`).flush(quote('Sent'));
                await settle();
                expect(component.emailOpen()).toBeFalse();
            });

            it('says how long to wait when the API asks for it (Retry-After), rounding up', async () => {
                const host = await open('Owner', quote('Sent'));

                await failWith(host, 429, 'rate_limit.exceeded', 'Demasiadas peticiones.', { 'Retry-After': '90' });

                expect(text(host, 'quote-email-error')).toBe('Demasiadas peticiones. Inténtalo de nuevo en 2 minutos.');
            });

            it('shows the first field error of the API when it refuses the address', async () => {
                const host = await open('Owner', quote('Sent'));
                await openDialog(host);
                await clickSend(host);

                httpMock.expectOne(emailUrl).flush(
                    { status: 400, code: 'validation.failed', detail: 'La petición no es válida.', errors: [{ field: 'Recipient', code: 'common.email_invalid', message: 'El email no es válido.' }] },
                    { status: 400, statusText: 'Bad Request' }
                );
                await settle();

                expect(text(host, 'quote-email-error')).toBe('El email no es válido.');
            });

            it('turns «the company has no fiscal data» into the usual warning with its link, and closes the dialog', async () => {
                const host = await open('Owner', quote('Sent'));
                expect(el(host, 'quote-profile-notice')).toBeNull();

                await openDialog(host);
                await clickSend(host);
                httpMock.expectOne(emailUrl).flush(apiProblem(400, 'quote.company_profile_incomplete', 'Para generar el PDF hay que completar antes los datos de la empresa.'), { status: 400, statusText: 'Bad Request' });
                await settle();

                expect(component.emailOpen()).toBeFalse();
                expect(el(host, 'quote-profile-notice')).not.toBeNull();
                expect(el(host, 'quote-profile-link')).not.toBeNull();
            });

            it('shows a fallback message when the answer is not JSON (a proxy) and the network message when there is no connection', async () => {
                const host = await open('Owner', quote('Sent'));
                await openDialog(host);

                await clickSend(host);
                httpMock.expectOne(emailUrl).flush('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' });
                await settle();
                expect(el(host, 'quote-email-error')).not.toBeNull();
                expect(text(host, 'quote-email-error')).not.toContain('<html>');

                await clickSend(host);
                httpMock.expectOne(emailUrl).error(new ProgressEvent('error'), { status: 0, statusText: '' });
                await settle();
                expect(el(host, 'quote-email-error')).not.toBeNull();
            });

            it('changes nothing of the quote when it fails: no reload, same version', async () => {
                const host = await open('Owner', quote('Sent'));

                await failWith(host, 502, 'quote.email_not_sent', 'No se ha podido mandar.');

                expect(component.quote()?.version).toBe('VERSION-1');
                expect(el(host, 'quote-emailed')).toBeNull();
            });
        });

        describe('formatWait', () => {
            it('says seconds up to a minute, then minutes and then hours, always rounding up', () => {
                expect(formatWait(1)).toBe('1 segundo');
                expect(formatWait(59)).toBe('59 segundos');
                expect(formatWait(60)).toBe('1 minuto');
                expect(formatWait(61)).toBe('2 minutos');
                expect(formatWait(90)).toBe('2 minutos');
                expect(formatWait(3540)).toBe('59 minutos');
                expect(formatWait(3541)).toBe('1 hora');
                expect(formatWait(3600)).toBe('1 hora');
                expect(formatWait(3601)).toBe('2 horas');
            });
        });
    });
});
