import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { TERMS_VERSION } from '../../core/constants/legal';
import { AppFloatingConfigurator } from '../../layout/component/app.floatingconfigurator';
import { AcceptInvitation } from './accept-invitation';

// El configurador flotante de tema usa document.startViewTransition, que desconecta el Chrome sin interfaz de las pruebas; aquí no se prueba el tema.
@Component({ selector: 'app-floating-configurator', standalone: true, template: '' })
class StubFloatingConfigurator {}

describe('AcceptInvitation · terms of use (spec 021 D8)', () => {
    const url = `${environment.apiUrl}/auth/accept-invitation`;
    const token = 'tok_inv-123';
    const password = 'Clave-elegida-2026!';
    const noContent = { status: 204, statusText: 'No Content' };
    let httpMock: HttpTestingController;
    let navigate: jasmine.Spy;

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        TestBed.overrideComponent(AcceptInvitation, { remove: { imports: [AppFloatingConfigurator] }, add: { imports: [StubFloatingConfigurator] } });
        httpMock = TestBed.inject(HttpTestingController);
        navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    });

    afterEach(() => {
        httpMock.verify();
        history.replaceState(history.state, '', location.pathname);
    });

    function open(hash: string | null = `#token=${token}`): { fixture: ComponentFixture<AcceptInvitation>; component: AcceptInvitation } {
        history.replaceState(history.state, '', location.pathname + (hash ?? ''));
        const fixture = TestBed.createComponent(AcceptInvitation);
        fixture.detectChanges();
        return { fixture, component: fixture.componentInstance };
    }

    const root = (fixture: ComponentFixture<AcceptInvitation>) => fixture.nativeElement as HTMLElement;

    function fill(component: AcceptInvitation, acceptTerms = true): void {
        component.form.setValue({ name: 'Ana Pérez', password, confirm: password, acceptTerms });
    }

    it('shows the terms checkbox', () => {
        const { fixture } = open();

        expect(root(fixture).querySelector('app-terms-checkbox')).not.toBeNull();
    });

    it('does not show the form (nor the checkbox) without a token', () => {
        const { fixture } = open(null);

        expect(root(fixture).querySelector('form')).toBeNull();
        expect(root(fixture).querySelector('app-terms-checkbox')).toBeNull();
    });

    it('is invalid until the terms are accepted', () => {
        const { component } = open();

        fill(component, false);
        expect(component.form.invalid).toBeTrue();
        expect(component.form.controls.acceptTerms.errors?.['required']).toBeTrue();

        fill(component, true);
        expect(component.form.valid).toBeTrue();
    });

    it('does not send anything while the terms are not accepted', () => {
        const { component } = open();
        fill(component, false);

        component.submit();

        httpMock.expectNone(url);
    });

    it('sends the current terms version with the name and the password (never the confirmation nor the checkbox)', () => {
        const { component } = open();
        fill(component);

        component.submit();

        const request = httpMock.expectOne(url);
        expect(request.request.body).toEqual({ token, name: 'Ana Pérez', password, acceptedTermsVersion: TERMS_VERSION });
        expect(Object.keys(request.request.body as object).sort()).toEqual(['acceptedTermsVersion', 'name', 'password', 'token']);
        request.flush(null, noContent);
    });

    it('on success goes to the login with the notice', () => {
        const { component } = open();
        fill(component);

        component.submit();
        httpMock.expectOne(url).flush(null, noContent);

        expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], { state: { info: 'Cuenta creada. Ya puedes entrar con tu email y tu contraseña.' } });
        expect(component.token).toBeNull();
    });

    it('shows the text of a terms rejection (the field error) and keeps the form and the token', () => {
        const { fixture, component } = open();
        fill(component);

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

        expect(root(fixture).textContent).toContain('Hay nuevas condiciones: recarga la página para leerlas.');
        expect(root(fixture).textContent).not.toContain('Hay datos no válidos.');
        expect(root(fixture).querySelector('form')).not.toBeNull();
        expect(component.token).toBe(token);
    });

    it('shows the API text of an invitation that does not serve', () => {
        const { fixture, component } = open();
        fill(component);

        component.submit();
        httpMock.expectOne(url).flush({ code: 'invitation.invalid', detail: 'La invitación no es válida.' }, { status: 400, statusText: 'Bad Request' });
        fixture.detectChanges();

        expect(root(fixture).textContent).toContain('La invitación no es válida.');
    });
});
