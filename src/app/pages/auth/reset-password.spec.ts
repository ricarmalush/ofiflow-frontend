import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { PASSWORD_RESET_DONE_MESSAGE, PASSWORD_RESET_NO_TOKEN_MESSAGE, ResetPassword } from './reset-password';
import { AppFloatingConfigurator } from '../../layout/component/app.floatingconfigurator';

// El configurador flotante de tema usa document.startViewTransition, que desconecta el Chrome sin interfaz de las pruebas; aquí no se prueba el tema.
@Component({ selector: 'app-floating-configurator', standalone: true, template: '' })
class StubFloatingConfigurator {}

describe('ResetPassword (spec 018)', () => {
    const url = `${environment.apiUrl}/auth/reset-password`;
    const token = 'tok_abc-123';
    const password = 'Clave-nueva-2026!';
    let httpMock: HttpTestingController;
    let navigate: jasmine.Spy;

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        TestBed.overrideComponent(ResetPassword, { remove: { imports: [AppFloatingConfigurator] }, add: { imports: [StubFloatingConfigurator] } });
        httpMock = TestBed.inject(HttpTestingController);
        navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    });

    afterEach(() => {
        httpMock.verify();
        history.replaceState(history.state, '', location.pathname);
    });

    // Abre la página como lo hace el enlace del correo: con el token en el fragmento.
    function open(hash: string | null = `#token=${token}`): { fixture: ComponentFixture<ResetPassword>; component: ResetPassword } {
        history.replaceState(history.state, '', location.pathname + (hash ?? ''));
        const fixture = TestBed.createComponent(ResetPassword);
        fixture.detectChanges();
        return { fixture, component: fixture.componentInstance };
    }

    const text = (fixture: ComponentFixture<ResetPassword>) => (fixture.nativeElement as HTMLElement).textContent ?? '';
    const form = (fixture: ComponentFixture<ResetPassword>) => (fixture.nativeElement as HTMLElement).querySelector('form');
    const link = (fixture: ComponentFixture<ResetPassword>) => (fixture.nativeElement as HTMLElement).querySelector('a[href="/auth/forgot-password"]');
    const noContent = { status: 204, statusText: 'No Content' };

    function fill(component: ResetPassword, value = password, confirm = value): void {
        component.form.setValue({ password: value, confirm });
    }

    // ===== El token del enlace =====

    it('reads the token from the fragment and removes it from the address bar', () => {
        const { component } = open();

        expect(component.token).toBe(token);
        expect(location.hash).toBe('');
    });

    it('never puts the token in the page', () => {
        const { fixture } = open();

        expect(text(fixture)).not.toContain(token);
        expect((fixture.nativeElement as HTMLElement).innerHTML).not.toContain(token);
    });

    it('without a token shows the error and a link to ask for another, and no form', () => {
        const { fixture } = open(null);

        expect(text(fixture)).toContain(PASSWORD_RESET_NO_TOKEN_MESSAGE);
        expect(link(fixture)).not.toBeNull();
        expect(form(fixture)).toBeNull();
    });

    it('does not accept a token in the query string', () => {
        history.replaceState(history.state, '', `${location.pathname}?token=${token}`);
        const fixture = TestBed.createComponent(ResetPassword);
        fixture.detectChanges();

        expect(fixture.componentInstance.token).toBeNull();
        history.replaceState(history.state, '', location.pathname);
    });

    // ===== El formulario =====

    it('shows two password fields', () => {
        const { fixture } = open();

        expect(form(fixture)).not.toBeNull();
        expect((fixture.nativeElement as HTMLElement).querySelectorAll('p-password').length).toBe(2);
    });

    it('is invalid with different passwords, with a short one and with a too long one', () => {
        const { component } = open();

        fill(component, password, 'otra-distinta-123');
        expect(component.form.invalid).toBeTrue();
        expect(component.form.errors?.['mismatch']).toBeTrue();

        fill(component, '1234567');
        expect(component.form.invalid).toBeTrue();

        fill(component, 'a'.repeat(129));
        expect(component.form.invalid).toBeTrue();

        fill(component, '12345678');
        expect(component.form.valid).toBeTrue();
        fill(component, 'a'.repeat(128));
        expect(component.form.valid).toBeTrue();
    });

    it('does not send anything while the form is invalid', () => {
        const { component } = open();
        fill(component, 'corta');

        component.submit();

        httpMock.expectNone(url);
    });

    // ===== Enviar =====

    it('sends the token and the new password (never the confirmation)', () => {
        const { component } = open();
        fill(component);

        component.submit();

        const request = httpMock.expectOne(url);
        expect(request.request.body).toEqual({ token, newPassword: password });
        request.flush(null, noContent);
    });

    it('on success goes to the login with the notice, and forgets the token and the password', () => {
        const { component } = open();
        fill(component);

        component.submit();
        httpMock.expectOne(url).flush(null, noContent);

        expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], { state: { info: PASSWORD_RESET_DONE_MESSAGE } });
        expect(component.token).toBeNull();
        expect(component.form.getRawValue()).toEqual({ password: '', confirm: '' });
    });

    it('does not open a session', () => {
        const { component } = open();
        fill(component);

        component.submit();
        httpMock.expectOne(url).flush(null, noContent);

        expect(sessionStorage.length).toBe(0);
    });

    it('ignores a second submit while the first is in flight', () => {
        const { component } = open();
        fill(component);

        component.submit();
        component.submit();

        httpMock.expectOne(url).flush(null, noContent);
    });

    // ===== Un enlace que no sirve =====

    it('on password_reset.invalid hides the form, shows the API text and offers another link', () => {
        const { fixture, component } = open();
        fill(component);

        component.submit();
        httpMock.expectOne(url).flush({ code: 'password_reset.invalid', detail: 'El enlace no es válido, ha caducado o ya se ha usado. Pide uno nuevo.' }, { status: 400, statusText: 'Bad Request' });
        fixture.detectChanges();

        expect(form(fixture)).toBeNull();
        expect(text(fixture)).toContain('El enlace no es válido, ha caducado o ya se ha usado. Pide uno nuevo.');
        expect(link(fixture)).not.toBeNull();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('treats a malformed token (rejected by the validation) the same way', () => {
        const { fixture, component } = open();
        fill(component);

        component.submit();
        httpMock.expectOne(url).flush(
            { code: 'validation.failed', detail: 'Hay datos no válidos.', errors: [{ field: 'token', code: 'password_reset.invalid', message: 'El enlace no es válido.' }] },
            { status: 400, statusText: 'Bad Request' }
        );
        fixture.detectChanges();

        expect(form(fixture)).toBeNull();
        expect(link(fixture)).not.toBeNull();
    });

    // ===== Un fallo que se puede reintentar =====

    it('on a password validation failure keeps the form and the token to try again', () => {
        const { fixture, component } = open();
        fill(component);

        component.submit();
        httpMock.expectOne(url).flush(
            { code: 'validation.failed', detail: 'La contraseña no es válida.', errors: [{ field: 'newPassword', code: 'length', message: 'Entre 8 y 128.' }] },
            { status: 400, statusText: 'Bad Request' }
        );
        fixture.detectChanges();

        expect(form(fixture)).not.toBeNull();
        expect(text(fixture)).toContain('La contraseña no es válida.');
        expect(component.token).toBe(token);

        component.submit();
        httpMock.expectOne(url).flush(null, noContent);
    });

    it('on the IP rate limit keeps the form and the token', () => {
        const { fixture, component } = open();
        fill(component);

        component.submit();
        httpMock.expectOne(url).flush({ code: 'rate_limit.exceeded', detail: 'Demasiadas peticiones.' }, { status: 429, statusText: 'Too Many Requests' });
        fixture.detectChanges();

        expect(form(fixture)).not.toBeNull();
        expect(text(fixture)).toContain('Demasiadas peticiones.');
        expect(component.token).toBe(token);
    });

    it('never shows the password again after a failure', () => {
        const { fixture, component } = open();
        fill(component);

        component.submit();
        httpMock.expectOne(url).flush({ code: 'password_reset.invalid', detail: 'El enlace no es válido.' }, { status: 400, statusText: 'Bad Request' });
        fixture.detectChanges();

        expect((fixture.nativeElement as HTMLElement).innerHTML).not.toContain(password);
    });
});
