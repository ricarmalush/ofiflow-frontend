import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CurrentSessionService } from '@/app/core/services/current-session';
import { buildAccount } from '@/app/core/testing/fake-account';
import { buildSessionToken } from '@/app/core/testing/fake-jwt';
import { TenantRole } from '@/app/shared/models/auth.model';
import { AppMenu } from './app.menu';

describe('AppMenu', () => {
    beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

    function render(role: TenantRole | null, permissions?: string[]): HTMLElement {
        if (role) {
            const session = TestBed.inject(CurrentSessionService);
            session.establish(buildSessionToken());
            session.setAccount(buildAccount({ role, ...(permissions ? { permissions } : {}) }));
        }
        const fixture = TestBed.createComponent(AppMenu);
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    const labels = (host: HTMLElement) => Array.from(host.querySelectorAll('a .layout-menuitem-text')).map((text) => text.textContent?.trim());
    const hrefOf = (host: HTMLElement, label: string) =>
        Array.from(host.querySelectorAll('a')).find((a) => a.querySelector('.layout-menuitem-text')?.textContent?.trim() === label)?.getAttribute('href');

    it('every role with Jobs.Read sees "Agenda", after "Clientes" and "Trabajos", pointing to /agenda', () => {
        for (const role of ['Owner', 'Admin', 'Manager', 'Employee', 'Technician'] as const) {
            TestBed.resetTestingModule();
            TestBed.configureTestingModule({ providers: [provideRouter([])] });
            const host = render(role);

            expect(labels(host)).withContext(role).toContain('Agenda');
            expect(hrefOf(host, 'Agenda')).withContext(role).toBe('/agenda');
            const order = labels(host).filter((label) => ['Clientes', 'Trabajos', 'Agenda'].includes(label ?? ''));
            expect(order).withContext(role).toEqual(['Clientes', 'Trabajos', 'Agenda']);
        }
    });

    it('without Jobs.Read there is no "Agenda" (nor "Trabajos")', () => {
        const host = render('Owner', ['Customers.Read', 'Account.Read']);

        expect(labels(host)).not.toContain('Agenda');
        expect(labels(host)).not.toContain('Trabajos');
        expect(labels(host)).toContain('Clientes');
    });

    it('before the account is loaded the menu offers nothing beyond the dashboard (fail-closed)', () => {
        const host = render(null);

        // «Inicio» es el encabezado de la sección y «Dashboard» su única entrada: ni Gestión, ni Administración, ni Mi cuenta.
        expect(labels(host)).toEqual(['Inicio', 'Dashboard']);
    });

    it('the menu follows a permission change WITHOUT navigating', () => {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount({ role: 'Owner', permissions: ['Customers.Read'] }));
        const fixture = TestBed.createComponent(AppMenu);
        fixture.detectChanges();
        expect(labels(fixture.nativeElement)).not.toContain('Agenda');

        session.setAccount(buildAccount({ role: 'Owner' }));
        fixture.detectChanges();

        expect(labels(fixture.nativeElement)).toContain('Agenda');
    });
});
