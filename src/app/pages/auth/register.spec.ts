import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { TERMS_VERSION } from '../../core/constants/legal';
import { AppFloatingConfigurator } from '../../layout/component/app.floatingconfigurator';
import { REGISTRATION_REQUESTED_MESSAGE, Register } from './register';

// El configurador flotante de tema usa document.startViewTransition, que desconecta el Chrome sin interfaz de las pruebas; aquí no se prueba el tema.
@Component({ selector: 'app-floating-configurator', standalone: true, template: '' })
class StubFloatingConfigurator {}

describe('Register (spec 021)', () => {
    const url = `${environment.apiUrl}/auth/registration`;
    const accepted = { status: 202, statusText: 'Accepted' };
    let fixture: ComponentFixture<Register>;
    let component: Register;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        TestBed.overrideComponent(Register, { remove: { imports: [AppFloatingConfigurator] }, add: { imports: [StubFloatingConfigurator] } });
        fixture = TestBed.createComponent(Register);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);
        fixture.detectChanges();
    });

    afterEach(() => httpMock.verify());

    const root = () => fixture.nativeElement as HTMLElement;
    const text = () => root().textContent ?? '';
    const form = () => root().querySelector('form');
    const byTestId = (id: string) => root().querySelector(`[data-testid="${id}"]`);

    function fill(overrides: Partial<{ companyName: string; userName: string; email: string; acceptTerms: boolean }> = {}): void {
        component.form.setValue({ companyName: 'Fontanería Demo SL', userName: 'Ana Pérez', email: 'ana@empresa.com', acceptTerms: true, ...overrides });
        fixture.detectChanges();
    }

    // ===== El formulario =====

    it('asks for the company, the name, the email and the terms, and NEVER for a password', () => {
        expect(form()).not.toBeNull();
        expect(root().querySelector('#companyName')).not.toBeNull();
        expect(root().querySelector('#userName')).not.toBeNull();
        expect(root().querySelector('#email')).not.toBeNull();
        expect(root().querySelector('app-terms-checkbox')).not.toBeNull();
        // La contraseña se elige al abrir el enlace del correo (D5), no aquí.
        expect(root().querySelector('p-password')).toBeNull();
        expect(root().querySelector('input[type="password"]')).toBeNull();
    });

    it('links back to the login', () => {
        expect(root().querySelector('a[href="/auth/login"]')).not.toBeNull();
    });

    it('is invalid until everything is filled in AND the terms are accepted', () => {
        expect(component.form.invalid).toBeTrue();

        fill({ acceptTerms: false });
        expect(component.form.invalid).toBeTrue();
        expect(component.form.controls.acceptTerms.errors?.['required']).toBeTrue();

        fill();
        expect(component.form.valid).toBeTrue();
    });

    it('does not send anything while the terms are not accepted', () => {
        fill({ acceptTerms: false });

        component.submit();

        httpMock.expectNone(url);
    });

    it('treats a field with only spaces as empty', () => {
        fill({ companyName: '   ' });
        expect(component.form.controls.companyName.errors?.['blank']).toBeTrue();
        expect(component.form.invalid).toBeTrue();

        fill({ userName: '   ' });
        expect(component.form.controls.userName.errors?.['blank']).toBeTrue();

        fill({ email: '   ' });
        expect(component.form.controls.email.invalid).toBeTrue();
    });

    it('rejects a malformed email and the lengths the API rejects', () => {
        fill({ email: 'sin-arroba' });
        expect(component.form.controls.email.invalid).toBeTrue();

        fill({ companyName: 'a'.repeat(201) });
        expect(component.form.controls.companyName.invalid).toBeTrue();
        fill({ companyName: 'a'.repeat(200) });
        expect(component.form.controls.companyName.valid).toBeTrue();

        fill({ userName: 'a'.repeat(201) });
        expect(component.form.controls.userName.invalid).toBeTrue();
    });

    // ===== Qué se envía =====

    it('sends the four fields with the current terms version, trimmed, and nothing else', () => {
        fill({ companyName: '  Fontanería Demo SL ', userName: ' Ana Pérez  ', email: '  ana@empresa.com ' });

        component.submit();

        const request = httpMock.expectOne(url);
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual({ companyName: 'Fontanería Demo SL', userName: 'Ana Pérez', email: 'ana@empresa.com', acceptedTermsVersion: TERMS_VERSION });
        // Ni la casilla ni ninguna contraseña viajan: la versión aceptada ES la casilla.
        expect(Object.keys(request.request.body as object).sort()).toEqual(['acceptedTermsVersion', 'companyName', 'email', 'userName']);
        request.flush(null, accepted);
    });

    it('sends when the person clicks the real submit button, at the first click (not only when submit() is called from code)', () => {
        fill();
        fixture.detectChanges();
        const button = root().querySelector<HTMLButtonElement>('button[type="submit"]')!;
        expect(button.disabled).toBeFalse();

        button.click();

        httpMock.expectOne(url).flush(null, accepted);
    });

    it('does not send when the real button is clicked while the terms are not accepted', () => {
        fill({ acceptTerms: false });
        fixture.detectChanges();
        const button = root().querySelector<HTMLButtonElement>('button[type="submit"]')!;

        expect(button.disabled).toBeTrue();
        button.click();

        httpMock.expectNone(url);
    });

    it('ignores a second submit while the first is in flight', () => {
        fill();

        component.submit();
        component.submit();

        httpMock.expectOne(url).flush(null, accepted);
    });

    it('shows the button as loading while it waits', () => {
        fill();

        component.submit();

        expect(component.loading()).toBeTrue();
        httpMock.expectOne(url).flush(null, accepted);
        expect(component.loading()).toBeFalse();
    });

    // ===== Tras pedir: siempre el mismo mensaje, sin afirmar nada =====

    it('after a 202 shows the message and hides the form', () => {
        fill();

        component.submit();
        httpMock.expectOne(url).flush(null, accepted);
        fixture.detectChanges();

        expect(byTestId('requested-message')?.textContent).toContain(REGISTRATION_REQUESTED_MESSAGE);
        expect(form()).toBeNull();
    });

    it('never claims that anything was sent, nor that the account exists or not', () => {
        // La API responde 202 igual con un email nuevo, con uno que ya tiene cuenta, con el límite superado y con el correo apagado.
        expect(REGISTRATION_REQUESTED_MESSAGE).toContain('Si el email es válido');
        expect(REGISTRATION_REQUESTED_MESSAGE).not.toMatch(/hemos enviado|te enviamos|se ha enviado|enviado/i);
        expect(REGISTRATION_REQUESTED_MESSAGE).not.toMatch(/ya existe|ya tienes una cuenta|nueva cuenta creada/i);
    });

    it('says exactly the same for every 202 (the page cannot tell them apart)', () => {
        fill({ email: 'nueva@empresa.com' });
        component.submit();
        httpMock.expectOne(url).flush(null, accepted);
        fixture.detectChanges();
        const first = byTestId('requested-message')?.textContent;

        fixture = TestBed.createComponent(Register);
        component = fixture.componentInstance;
        fixture.detectChanges();
        fill({ email: 'existente@empresa.com' });
        component.submit();
        httpMock.expectOne(url).flush(null, accepted);
        fixture.detectChanges();

        expect(byTestId('requested-message')?.textContent).toBe(first);
    });

    it('forgets what was typed: the email is neither in the page nor in memory', () => {
        fill({ email: 'ana.privada@empresa.com', companyName: 'Empresa Privada SL', userName: 'Persona Privada' });

        component.submit();
        httpMock.expectOne(url).flush(null, accepted);
        fixture.detectChanges();

        expect(component.form.getRawValue()).toEqual({ companyName: '', userName: '', email: '', acceptTerms: false });
        expect(root().innerHTML).not.toContain('ana.privada@empresa.com');
        expect(text()).not.toContain('Empresa Privada');
    });

    it('does not open a session', () => {
        fill();

        component.submit();
        httpMock.expectOne(url).flush(null, accepted);

        expect(sessionStorage.length).toBe(0);
    });

    // ===== Los errores =====

    it('paints a field error in its field (the API names them like the C# properties)', () => {
        fill();

        component.submit();
        httpMock.expectOne(url).flush(
            { code: 'validation.failed', detail: 'Hay datos no válidos.', errors: [{ field: 'Email', code: 'email', message: 'El email no es válido.' }] },
            { status: 400, statusText: 'Bad Request' }
        );
        fixture.detectChanges();

        expect(component.form.controls.email.errors?.['api']).toBe('El email no es válido.');
        expect(text()).toContain('El email no es válido.');
        // Y el formulario se queda, con lo escrito, para corregirlo.
        expect(form()).not.toBeNull();
        expect(component.form.controls.companyName.value).toBe('Fontanería Demo SL');
        // Un error de campo ya está en su campo: no se repite arriba.
        expect(byTestId('register-error')).toBeNull();
    });

    it('paints the errors of the company and the name in their own fields', () => {
        fill();

        component.submit();
        httpMock.expectOne(url).flush(
            {
                code: 'validation.failed',
                detail: 'Hay datos no válidos.',
                errors: [
                    { field: 'CompanyName', code: 'max', message: 'Es demasiado largo.' },
                    { field: 'UserName', code: 'required', message: 'Falta el nombre.' }
                ]
            },
            { status: 400, statusText: 'Bad Request' }
        );

        expect(component.form.controls.companyName.errors?.['api']).toBe('Es demasiado largo.');
        expect(component.form.controls.userName.errors?.['api']).toBe('Falta el nombre.');
    });

    it('shows a terms-version rejection on top with the API text and keeps the form', () => {
        fill();

        component.submit();
        httpMock.expectOne(url).flush(
            {
                code: 'validation.failed',
                detail: 'Hay datos no válidos.',
                errors: [{ field: 'AcceptedTermsVersion', code: 'registration.terms_not_accepted', message: 'Hay nuevas condiciones: recarga la página para leerlas.' }]
            },
            { status: 400, statusText: 'Bad Request' }
        );
        fixture.detectChanges();

        expect(byTestId('register-error')?.textContent).toContain('Hay nuevas condiciones: recarga la página para leerlas.');
        expect(form()).not.toBeNull();
    });

    it('on the IP rate limit shows the API text on top and keeps what was typed', () => {
        fill();

        component.submit();
        httpMock.expectOne(url).flush({ code: 'rate_limit.exceeded', detail: 'Demasiadas peticiones.' }, { status: 429, statusText: 'Too Many Requests' });
        fixture.detectChanges();

        expect(byTestId('register-error')?.textContent).toContain('Demasiadas peticiones.');
        expect(form()).not.toBeNull();
        expect(component.form.controls.email.value).toBe('ana@empresa.com');
        expect(component.requested()).toBeFalse();
    });

    it('on a network failure says so and keeps the form', () => {
        fill();

        component.submit();
        httpMock.expectOne(url).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
        fixture.detectChanges();

        expect(byTestId('register-error')).not.toBeNull();
        expect(form()).not.toBeNull();
        expect(component.requested()).toBeFalse();
    });

    it('clears the previous error when it tries again', () => {
        fill();
        component.submit();
        httpMock.expectOne(url).flush({ code: 'rate_limit.exceeded', detail: 'Demasiadas peticiones.' }, { status: 429, statusText: 'Too Many Requests' });
        fixture.detectChanges();
        expect(component.error()).not.toBeNull();

        component.submit();

        expect(component.error()).toBeNull();
        httpMock.expectOne(url).flush(null, accepted);
    });

    it('lets the person correct a field the API rejected (the error goes away when they edit it)', () => {
        fill();
        component.submit();
        httpMock.expectOne(url).flush(
            { code: 'validation.failed', detail: 'Hay datos no válidos.', errors: [{ field: 'Email', code: 'email', message: 'El email no es válido.' }] },
            { status: 400, statusText: 'Bad Request' }
        );
        expect(component.form.invalid).toBeTrue();

        component.form.controls.email.setValue('otro@empresa.com');

        expect(component.form.controls.email.errors?.['api']).toBeUndefined();
        expect(component.form.valid).toBeTrue();
    });
});
