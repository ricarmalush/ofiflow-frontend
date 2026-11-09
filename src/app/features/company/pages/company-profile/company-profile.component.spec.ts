import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../../environments/environment';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { EMPTY_COMPANY_PROFILE } from '../../../../shared/models/company-profile.model';
import { TenantRole } from '../../../../shared/models/auth.model';
import { CompanyProfileComponent } from './company-profile.component';

const url = `${environment.apiUrl}/company/profile`;

// Un perfil como lo devolvería la API (el NIF ya normalizado).
const profile = (overrides: Record<string, unknown> = {}) => ({
    legalName: 'Fontanería Demo S.L.',
    taxId: 'B12345674',
    addressLine: 'Calle Mayor 1',
    postalCode: '28001',
    city: 'Madrid',
    province: 'Madrid',
    phone: '600123456',
    email: 'info@demo.es',
    isComplete: true,
    ...overrides
});

describe('CompanyProfileComponent', () => {
    let fixture: ComponentFixture<CompanyProfileComponent>;
    let component: CompanyProfileComponent;
    let httpMock: HttpTestingController;
    let added: { severity?: string; summary?: string }[];

    function setup(role: TenantRole = 'Owner', permissions?: string[]): void {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount({ role, ...(permissions ? { permissions } : {}) }));
        httpMock = TestBed.inject(HttpTestingController);
        added = [];
        spyOn(TestBed.inject(MessageService), 'add').and.callFake((m) => void added.push(m));
        fixture = TestBed.createComponent(CompanyProfileComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    // Responde a la lectura inicial (la pantalla la pide al abrirse).
    function loaded(body: object): void {
        httpMock.expectOne(url).flush(body);
        fixture.detectChanges();
    }

    const host = () => fixture.nativeElement as HTMLElement;
    const input = (id: string) => host().querySelector<HTMLInputElement>(`#${id}`)!;
    const saveButton = () => host().querySelector('p-button[type="submit"]');
    const text = () => host().textContent ?? '';

    function type(values: Record<string, string>): void {
        for (const [id, value] of Object.entries(values)) {
            const el = input(id);
            el.value = value;
            el.dispatchEvent(new Event('input'));
        }
        fixture.detectChanges();
    }

    const VALID = { legalName: 'Fontanería Demo S.L.', taxId: 'b-1234567-4', addressLine: 'Calle Mayor 1', postalCode: '28001', city: 'Madrid' };

    beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), MessageService] }));

    afterEach(() => httpMock.verify());

    describe('reading', () => {
        it('asks for the profile when it opens, with no id and no company', () => {
            setup();

            const req = httpMock.expectOne(url);
            expect(req.request.method).toBe('GET');
            req.flush(profile());
        });

        it('shows the profile it receives in the eight fields', () => {
            setup();
            loaded(profile());

            expect(input('legalName').value).toBe('Fontanería Demo S.L.');
            expect(input('taxId').value).toBe('B12345674');
            expect(input('addressLine').value).toBe('Calle Mayor 1');
            expect(input('postalCode').value).toBe('28001');
            expect(input('city').value).toBe('Madrid');
            expect(input('province').value).toBe('Madrid');
            expect(input('phone').value).toBe('600123456');
            expect(input('email').value).toBe('info@demo.es');
        });

        it('a complete profile shows no "complete your data" notice', () => {
            setup();
            loaded(profile());

            expect(host().querySelector('[data-testid="incomplete-notice"]')).toBeNull();
        });

        it('an empty profile (every field null, isComplete false) shows the empty form and the notice to complete it, not an error', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);

            expect(host().querySelector('[data-testid="incomplete-notice"]')).not.toBeNull();
            expect(text()).toContain('Completa los datos de tu empresa');
            for (const id of ['legalName', 'taxId', 'addressLine', 'postalCode', 'city', 'province', 'phone', 'email']) {
                expect(input(id).value).withContext(id).toBe('');
            }
            expect(component.errorMessage()).toBeNull();
            expect(component.form.enabled).toBeTrue();
        });

        it('shows no notice before the API has answered (it does not know yet)', () => {
            setup();

            expect(host().querySelector('[data-testid="incomplete-notice"]')).toBeNull();
            httpMock.expectOne(url).flush(profile());
        });

        it('a failed read shows the API message and leaves the form disabled and without a save button', () => {
            setup();
            httpMock.expectOne(url).flush({ status: 500, detail: 'Algo falló.' }, { status: 500, statusText: 'Server Error' });
            fixture.detectChanges();

            expect(text()).toContain('Algo falló.');
            expect(component.form.disabled).toBeTrue();
            expect(component.profile()).toBeNull();
            expect(host().querySelector('[data-testid="incomplete-notice"]')).toBeNull();
        });

        it('the inputs carry the length limits of the API', () => {
            setup();
            loaded(profile());

            expect(input('legalName').maxLength).toBe(200);
            expect(input('taxId').maxLength).toBe(20);
            expect(input('addressLine').maxLength).toBe(200);
            expect(input('city').maxLength).toBe(100);
            expect(input('province').maxLength).toBe(100);
        });
    });

    describe('without Company.Manage (read only)', () => {
        for (const role of ['Manager', 'Employee'] as const) {
            it(`${role}: sees the data, every field is disabled and there is no save button`, () => {
                setup(role);
                loaded(profile());

                expect(component.canManage()).toBeFalse();
                expect(component.form.disabled).toBeTrue();
                for (const id of ['legalName', 'taxId', 'addressLine', 'postalCode', 'city', 'province', 'phone', 'email']) {
                    expect(input(id).disabled).withContext(id).toBeTrue();
                }
                expect(input('taxId').value).toBe('B12345674');
                expect(saveButton()).toBeNull();
                expect(host().querySelector('[data-testid="read-only-notice"]')).not.toBeNull();
            });
        }

        it('even if save() is called directly nothing is sent (the API would answer 403 anyway)', () => {
            setup('Employee');
            loaded(profile());

            component.save();
            fixture.detectChanges();

            httpMock.expectNone(url);
            expect(component.saving()).toBeFalse();
        });

        it('with an empty profile the notice does not invite them to fill it in: it tells them to ask whoever administers', () => {
            setup('Manager');
            loaded(EMPTY_COMPANY_PROFILE);

            expect(text()).toContain('todavía no están completos');
            expect(text()).not.toContain('Completa los datos de tu empresa');
        });

        it('is decided by the permission, not by the role name (an Owner without Company.Manage is read only too)', () => {
            setup('Owner', ['Company.Read']);
            loaded(profile());

            expect(component.form.disabled).toBeTrue();
            expect(saveButton()).toBeNull();
        });
    });

    describe('with Company.Manage', () => {
        for (const role of ['Owner', 'Admin'] as const) {
            it(`${role}: the fields are editable and there is a save button, and no read-only notice`, () => {
                setup(role);
                loaded(profile());

                expect(component.canManage()).toBeTrue();
                expect(component.form.enabled).toBeTrue();
                expect(saveButton()).not.toBeNull();
                expect(host().querySelector('[data-testid="read-only-notice"]')).toBeNull();
            });
        }

        it('saves the eight fields trimmed and puts an empty optional as null (so the API erases it)', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type({ ...VALID, legalName: '  Fontanería Demo S.L.  ', province: '   ', phone: '', email: '' });

            component.save();

            const req = httpMock.expectOne(url);
            expect(req.request.method).toBe('PUT');
            expect(req.request.body).toEqual({
                legalName: 'Fontanería Demo S.L.',
                taxId: 'b-1234567-4',
                addressLine: 'Calle Mayor 1',
                postalCode: '28001',
                city: 'Madrid',
                province: null,
                phone: null,
                email: null
            });
            req.flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(url).flush(profile());
        });

        it('sends the tax id as it was typed (the API normalizes) and then shows it as it was stored', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type(VALID);

            component.save();
            const put = httpMock.expectOne(url);
            expect((put.request.body as { taxId: string }).taxId).toBe('b-1234567-4');
            put.flush(null, { status: 204, statusText: 'No Content' });
            // La relectura trae el NIF normalizado.
            const reread = httpMock.expectOne(url);
            expect(reread.request.method).toBe('GET');
            reread.flush(profile({ taxId: 'B12345674' }));
            fixture.detectChanges();

            expect(input('taxId').value).toBe('B12345674');
            expect(component.profile()?.isComplete).toBeTrue();
            expect(host().querySelector('[data-testid="incomplete-notice"]')).toBeNull();
        });

        it('announces the save with a toast and leaves no error on screen', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type(VALID);

            component.save();
            httpMock.expectOne(url).flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(url).flush(profile());

            expect(added.length).toBe(1);
            expect(added[0].severity).toBe('success');
            expect(component.errorMessage()).toBeNull();
            expect(component.saving()).toBeFalse();
        });

        it('does not send twice if save is pressed again while the first is in flight', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type(VALID);

            component.save();
            component.save();

            const requests = httpMock.match(url);
            expect(requests.length).toBe(1);
            requests[0].flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(url).flush(profile());
        });

        it('if re-reading after saving fails, what was saved stays saved: the toast is shown and the form stays editable', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type(VALID);

            component.save();
            httpMock.expectOne(url).flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(url).flush({ status: 500, detail: 'No se pudo leer.' }, { status: 500, statusText: 'Server Error' });
            fixture.detectChanges();

            expect(added.length).toBe(1);
            expect(component.errorMessage()).toBe('No se pudo leer.');
            expect(component.form.enabled).toBeTrue();
            expect(component.saving()).toBeFalse();
        });

        it('trims the five required fields before sending, each one (not only the legal name)', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type({ legalName: '  Fontanería Demo S.L. ', taxId: '  b-1234567-4  ', addressLine: '  Calle Mayor 1 ', postalCode: ' 28001 ', city: '  Madrid ' });

            component.save();

            const put = httpMock.expectOne(url);
            expect(put.request.body).toEqual(jasmine.objectContaining({ legalName: 'Fontanería Demo S.L.', taxId: 'b-1234567-4', addressLine: 'Calle Mayor 1', postalCode: '28001', city: 'Madrid' }));
            put.flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(url).flush(profile());
        });

        it('an optional made only of spaces counts as empty: valid, and sent as null', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type({ ...VALID, phone: '     ', email: '   ', province: '  ' });

            expect(component.form.controls.phone.valid).toBeTrue();
            expect(component.form.controls.email.valid).toBeTrue();
            component.save();

            const put = httpMock.expectOne(url);
            expect(put.request.body).toEqual(jasmine.objectContaining({ province: null, phone: null, email: null }));
            put.flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(url).flush(profile());
        });

        it('erasing an optional and saving sends it as null', () => {
            setup();
            loaded(profile());
            type({ phone: '', email: '' });

            component.save();

            const put = httpMock.expectOne(url);
            const body = put.request.body as Record<string, unknown>;
            expect(body['phone']).toBeNull();
            expect(body['email']).toBeNull();
            expect(body['province']).toBe('Madrid');
            put.flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(url).flush(profile({ phone: null, email: null }));
        });
    });

    describe('validation on screen (a help: the API decides)', () => {
        it('a wrong NIF check letter blocks the save, sends nothing and says so under the field', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type({ ...VALID, taxId: '12345678A' });

            component.save();
            fixture.detectChanges();

            httpMock.expectNone(url);
            expect(text()).toContain('El NIF, NIE o CIF no es válido');
        });

        it('accepts a NIF, a NIE and a CIF, however they are written', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);

            for (const taxId of ['12345678Z', '12.345.678-z', ' x1234567l ', 'A82018474', 'p2807900b']) {
                type({ taxId });
                expect(component.form.controls.taxId.valid).withContext(taxId).toBeTrue();
            }
            for (const taxId of ['12345678', '12345678A', 'K1234567A', 'ſ1234567D', 'A82018475']) {
                type({ taxId });
                expect(component.form.controls.taxId.valid).withContext(taxId).toBeFalse();
            }
        });

        it('a postal code from a province that does not exist blocks the save', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type({ ...VALID, postalCode: '53001' });

            component.save();
            fixture.detectChanges();

            httpMock.expectNone(url);
            expect(text()).toContain('código postal español');
        });

        it('each of the five required fields blocks the save when it is blank and says "Obligatorio"', () => {
            for (const field of ['legalName', 'taxId', 'addressLine', 'postalCode', 'city']) {
                TestBed.resetTestingModule();
                TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), MessageService] });
                setup();
                loaded(EMPTY_COMPANY_PROFILE);
                type({ ...VALID, [field]: '   ' });

                component.save();
                fixture.detectChanges();

                httpMock.expectNone(url);
                expect(component.form.get(field)?.errors?.['required']).withContext(field).toBeTrue();
                expect(text()).withContext(field).toContain('Obligatorio.');
                httpMock.verify();
            }
        });

        it('the three optionals may be empty', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type({ ...VALID, province: '', phone: '', email: '' });

            expect(component.form.valid).toBeTrue();
            component.save();
            httpMock.expectOne(url).flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(url).flush(profile());
        });

        it('a phone with spaces at the ends is valid (it is trimmed, like the API does) and a bad one is not', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);

            type({ phone: ' 600 123 456 ' });
            expect(component.form.controls.phone.valid).toBeTrue();
            type({ phone: '12' });
            expect(component.form.controls.phone.valid).toBeFalse();
            type({ phone: 'abc def ghi' });
            expect(component.form.controls.phone.valid).toBeFalse();
        });

        it('an email with spaces at the ends is valid and a malformed one is not', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);

            type({ email: ' info@demo.es ' });
            expect(component.form.controls.email.valid).toBeTrue();
            type({ email: 'sin-arroba' });
            expect(component.form.controls.email.valid).toBeFalse();
        });

        it('nothing is shown as an error until the person has touched the field or tried to save', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);

            expect(text()).not.toContain('Obligatorio.');
        });
    });

    describe('errors from the API, field by field', () => {
        function failWith(errors: { field: string; code: string; message: string }[], detail = 'Hay datos que corregir.'): void {
            component.save();
            httpMock.expectOne(url).flush({ status: 400, code: 'validation.failed', detail, errors }, { status: 400, statusText: 'Bad Request' });
            fixture.detectChanges();
        }

        it('paints each message under its own field (PascalCase from the API, camelCase in the form)', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type(VALID);

            failWith([
                { field: 'TaxId', code: 'company.tax_id_invalid', message: 'El NIF no cuadra.' },
                { field: 'PostalCode', code: 'company.postal_code_invalid', message: 'Código postal no válido.' }
            ]);

            expect(component.form.controls.taxId.errors?.['api']).toBe('El NIF no cuadra.');
            expect(component.form.controls.postalCode.errors?.['api']).toBe('Código postal no válido.');
            expect(component.form.controls.city.errors).toBeNull();
            expect(text()).toContain('El NIF no cuadra.');
            expect(text()).toContain('Código postal no válido.');
            expect(text()).toContain('Hay datos que corregir.');
        });

        it('leaves the form editable and the button usable after the error, and a corrected save goes through', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type(VALID);
            failWith([{ field: 'TaxId', code: 'company.tax_id_invalid', message: 'El NIF no cuadra.' }]);

            expect(component.saving()).toBeFalse();
            expect(component.form.enabled).toBeTrue();

            type({ taxId: 'B12345674' });
            component.save();
            httpMock.expectOne(url).flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(url).flush(profile());
            fixture.detectChanges();

            expect(component.errorMessage()).toBeNull();
            expect(component.form.controls.taxId.errors).toBeNull();
        });

        it('an error for a field the form does not know is ignored without failing', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type(VALID);

            expect(() => failWith([{ field: 'Nope', code: 'x', message: 'raro' }])).not.toThrow();
            expect(component.errorMessage()).toBe('Hay datos que corregir.');
        });

        it('a 403 on saving shows the message and sends the person nowhere (the role may have changed meanwhile)', () => {
            setup();
            loaded(EMPTY_COMPANY_PROFILE);
            type(VALID);

            component.save();
            httpMock.expectOne(url).flush({ status: 403, code: 'auth.forbidden', detail: 'No tienes permiso.' }, { status: 403, statusText: 'Forbidden' });
            fixture.detectChanges();

            expect(component.errorMessage()).toBe('No tienes permiso.');
            expect(component.saving()).toBeFalse();
        });
    });

    describe('personal data stays on the screen', () => {
        it('writes nothing in the browser storage', () => {
            setup();
            const before = [localStorage.length, sessionStorage.length];
            loaded(profile());
            type({ legalName: 'Otro nombre' });
            component.save();
            httpMock.expectOne(url).flush(null, { status: 204, statusText: 'No Content' });
            httpMock.expectOne(url).flush(profile());

            expect([localStorage.length, sessionStorage.length]).toEqual(before);
        });

        it('the tax id field turns off autocomplete and spellcheck', () => {
            setup();
            loaded(profile());

            expect(input('taxId').getAttribute('autocomplete')).toBe('off');
            expect(input('taxId').getAttribute('spellcheck')).toBe('false');
        });
    });
});
