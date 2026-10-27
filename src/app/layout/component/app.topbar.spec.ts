import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@/app/core/services/auth';
import { CurrentSessionService } from '@/app/core/services/current-session';
import { buildAccount } from '@/app/core/testing/fake-account';
import { buildSessionToken } from '@/app/core/testing/fake-jwt';
import { CurrentAccount } from '@/app/shared/models/account.model';
import { AppConfigurator } from './app.configurator';
import { AppTopbar } from './app.topbar';

describe('AppTopbar', () => {
    // El configurador de temas no pinta nada de la cuenta y aplica estilos globales: se deja fuera de estos tests.
    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        TestBed.overrideComponent(AppTopbar, { remove: { imports: [AppConfigurator] }, add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] } });
    });

    function render(account?: CurrentAccount): HTMLElement {
        // AuthService restaura la sesión de sessionStorage al crearse (y la vacía si no hay): se crea ANTES de poner la cuenta.
        TestBed.inject(AuthService);
        if (account) {
            const session = TestBed.inject(CurrentSessionService);
            session.establish(buildSessionToken());
            session.setAccount(account);
        }
        const fixture = TestBed.createComponent(AppTopbar);
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    const accountBlock = (host: HTMLElement) => host.querySelector('[data-testid="topbar-account"]');

    it('shows the company and the person from /account/me', () => {
        const block = accountBlock(render(buildAccount({ tenantName: 'Fontanería Demo', name: 'Ana Pérez' })));

        expect(block?.textContent).toContain('Fontanería Demo');
        expect(block?.textContent).toContain('Ana Pérez');
    });

    it('shows nothing while the account is not loaded (no invented name)', () => {
        expect(accountBlock(render())).toBeNull();
    });

    it('renders company and person as text, never as HTML', () => {
        const block = accountBlock(render(buildAccount({ tenantName: '<img src=x onerror=alert(1)>', name: '<b>x</b>' })));

        expect(block?.textContent).toContain('<img src=x onerror=alert(1)>');
        expect(block?.querySelector('img')).toBeNull();
        expect(block?.querySelector('b')).toBeNull();
    });
});
