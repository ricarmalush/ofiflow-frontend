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
