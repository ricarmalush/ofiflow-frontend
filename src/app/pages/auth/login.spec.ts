import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Login } from './login';
import { AppFloatingConfigurator } from '../../layout/component/app.floatingconfigurator';

// El configurador flotante de tema usa document.startViewTransition, que desconecta el Chrome sin interfaz de las pruebas; aquí no se prueba el tema.
@Component({ selector: 'app-floating-configurator', standalone: true, template: '' })
class StubFloatingConfigurator {}

describe('Login · forgotten password link (spec 018)', () => {
    let fixture: ComponentFixture<Login>;

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        TestBed.overrideComponent(Login, { remove: { imports: [AppFloatingConfigurator] }, add: { imports: [StubFloatingConfigurator] } });
        fixture = TestBed.createComponent(Login);
        fixture.detectChanges();
    });

    const link = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('[data-testid="forgot-password-link"]');

    it('offers the link to the recovery page on the credentials step', () => {
        expect(link()).not.toBeNull();
        expect(link()?.getAttribute('href')).toBe('/auth/forgot-password');
        expect(link()?.textContent).toContain('¿Has olvidado tu contraseña?');
    });

    it('does not offer it while the second-factor code is being asked for', () => {
        // En el segundo paso la contraseña ya fue correcta: el enlace no pinta nada ahí y solo distraería de escribir el código.
        fixture.componentInstance.step.set('mfa');
        fixture.detectChanges();

        expect(link()).toBeNull();
    });
});

describe('Login · create account link (spec 021)', () => {
    let fixture: ComponentFixture<Login>;

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        TestBed.overrideComponent(Login, { remove: { imports: [AppFloatingConfigurator] }, add: { imports: [StubFloatingConfigurator] } });
        fixture = TestBed.createComponent(Login);
        fixture.detectChanges();
    });

    const link = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('[data-testid="register-link"]');

    it('offers «¿No tienes cuenta? Crea una» on the credentials step, pointing to the registration page', () => {
        expect(link()).not.toBeNull();
        expect(link()?.getAttribute('href')).toBe('/auth/register');
        expect(link()?.textContent).toContain('Crea una');
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('¿No tienes cuenta?');
    });

    it('does not offer it while the second-factor code is being asked for', () => {
        // En el segundo paso la persona YA tiene cuenta (acaba de acertar su contraseña): el enlace de crear una no pinta nada ahí y distraería de escribir el código.
        fixture.componentInstance.step.set('mfa');
        fixture.detectChanges();

        expect(link()).toBeNull();
        expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('¿No tienes cuenta?');
    });
});
