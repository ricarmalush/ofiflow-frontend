import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { FORGOT_PASSWORD_SENT_MESSAGE, ForgotPassword } from './forgot-password';
import { AppFloatingConfigurator } from '../../layout/component/app.floatingconfigurator';

// El configurador flotante de tema usa document.startViewTransition, que desconecta el Chrome sin interfaz de las pruebas; aquí no se prueba el tema.
@Component({ selector: 'app-floating-configurator', standalone: true, template: '' })
class StubFloatingConfigurator {}

describe('ForgotPassword (spec 018)', () => {
    const url = `${environment.apiUrl}/auth/forgot-password`;
    let fixture: ComponentFixture<ForgotPassword>;
    let component: ForgotPassword;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        TestBed.overrideComponent(ForgotPassword, { remove: { imports: [AppFloatingConfigurator] }, add: { imports: [StubFloatingConfigurator] } });
        fixture = TestBed.createComponent(ForgotPassword);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);
        fixture.detectChanges();
    });

    afterEach(() => httpMock.verify());

    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
    const form = () => (fixture.nativeElement as HTMLElement).querySelector('form');
    const accepted = { status: 202, statusText: 'Accepted' };

    function ask(email: string): void {
        component.email = email;
        component.submit();
    }

    it('shows the email form and a way back to the login', () => {
        expect(form()).not.toBeNull();
        expect((fixture.nativeElement as HTMLElement).querySelector('a[href="/auth/login"]')).not.toBeNull();
    });

    it('does nothing with an empty or blank email', () => {
        ask('   ');

        httpMock.expectNone(url);
    });

    it('sends the trimmed email, and only the email', () => {
        ask('  ana@empresa.com ');

        const request = httpMock.expectOne(url);
        expect(request.request.body).toEqual({ email: 'ana@empresa.com' });
        request.flush(null, accepted);
    });

    it('on 202 hides the form and shows the message, and clears the email from memory', () => {
        ask('ana@empresa.com');
        httpMock.expectOne(url).flush(null, accepted);
        fixture.detectChanges();

        expect(form()).toBeNull();
        expect(text()).toContain(FORGOT_PASSWORD_SENT_MESSAGE);
        expect(component.email).toBe('');
    });

    it('says the same thing whatever the account is: it never claims that an email was sent', () => {
        // La API contesta 202 igual exista la cuenta o no; el texto no puede afirmar lo que la pantalla no sabe (spec 018 R1).
        expect(FORGOT_PASSWORD_SENT_MESSAGE).toMatch(/^Si existe una cuenta/);
        expect(FORGOT_PASSWORD_SENT_MESSAGE).not.toMatch(/hemos enviado|te hemos|se ha enviado/i);

        ask('desconocida@empresa.com');
        httpMock.expectOne(url).flush(null, accepted);
        fixture.detectChanges();
        const forUnknown = text();

        const other = TestBed.createComponent(ForgotPassword);
        other.detectChanges();
        other.componentInstance.email = 'conocida@empresa.com';
        other.componentInstance.submit();
        httpMock.expectOne(url).flush(null, accepted);
        other.detectChanges();

        expect((other.nativeElement as HTMLElement).textContent).toBe(forUnknown);
    });

    it('on a malformed-email 400 shows the API text and keeps the form to try again', () => {
        ask('sin-arroba');
        httpMock.expectOne(url).flush({ code: 'validation.failed', detail: 'El email no es válido.' }, { status: 400, statusText: 'Bad Request' });
        fixture.detectChanges();

        expect(text()).toContain('El email no es válido.');
        expect(form()).not.toBeNull();
        expect(text()).not.toContain(FORGOT_PASSWORD_SENT_MESSAGE);
    });

    it('on the IP rate limit shows the API text and keeps the form', () => {
        ask('ana@empresa.com');
        httpMock.expectOne(url).flush({ code: 'rate_limit.exceeded', detail: 'Demasiadas peticiones. Inténtalo más tarde.' }, { status: 429, statusText: 'Too Many Requests' });
        fixture.detectChanges();

        expect(text()).toContain('Demasiadas peticiones. Inténtalo más tarde.');
        expect(form()).not.toBeNull();
    });

    it('without network shows the connection message, not the success one', () => {
        ask('ana@empresa.com');
        httpMock.expectOne(url).error(new ProgressEvent('error'));
        fixture.detectChanges();

        expect(text()).toContain('No se pudo establecer comunicación');
        expect(text()).not.toContain(FORGOT_PASSWORD_SENT_MESSAGE);
    });

    it('clears the previous error when it tries again', () => {
        ask('sin-arroba');
        httpMock.expectOne(url).flush({ detail: 'El email no es válido.' }, { status: 400, statusText: 'Bad Request' });

        ask('ana@empresa.com');

        expect(component.error()).toBeNull();
        httpMock.expectOne(url).flush(null, accepted);
    });

    it('ignores a second submit while the first is in flight', () => {
        ask('ana@empresa.com');
        component.submit();

        httpMock.expectOne(url).flush(null, accepted);
    });
});
