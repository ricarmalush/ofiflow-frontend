import { ComponentFixture, TestBed } from '@angular/core/testing';
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

    it('"Presupuestos" is offered after "Agenda" to whoever has Quotes.Read, pointing to /quotes', () => {
        for (const role of ['Owner', 'Admin', 'Manager', 'Employee'] as const) {
            TestBed.resetTestingModule();
            TestBed.configureTestingModule({ providers: [provideRouter([])] });
            const host = render(role);

            expect(labels(host)).withContext(role).toContain('Presupuestos');
            expect(hrefOf(host, 'Presupuestos')).withContext(role).toBe('/quotes');
            expect(labels(host).filter((label) => ['Clientes', 'Trabajos', 'Agenda', 'Presupuestos'].includes(label ?? ''))).withContext(role).toEqual(['Clientes', 'Trabajos', 'Agenda', 'Presupuestos']);
        }
    });

    it('a Technician has no "Presupuestos" (the prices are commercial information)', () => {
        const host = render('Technician');

        expect(labels(host)).not.toContain('Presupuestos');
        expect(labels(host)).toContain('Trabajos');
    });

    it('without Quotes.Read there is no "Presupuestos", whatever else the account has', () => {
        const host = render('Owner', ['Customers.Read', 'Jobs.Read', 'Quotes.Write', 'Quotes.Issue']);

        expect(labels(host)).not.toContain('Presupuestos');
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

describe('AppMenu · segundo factor obligatorio (spec 022)', () => {
    beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

    function render(account: Parameters<typeof buildAccount>[0]): ComponentFixture<AppMenu> {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount(account));
        const fixture = TestBed.createComponent(AppMenu);
        fixture.detectChanges();
        return fixture;
    }

    const labels = (host: HTMLElement) => Array.from(host.querySelectorAll('a .layout-menuitem-text')).map((text) => text.textContent?.trim());

    it('whoever must enrol the factor sees ONLY "Seguridad" (everything else would answer 403)', () => {
        const fixture = render({ role: 'Owner', secondFactorEnrollmentRequired: true, secondFactorRequired: true });

        expect(labels(fixture.nativeElement)).toEqual(['Mi cuenta', 'Seguridad']);
        const link = fixture.nativeElement.querySelector('a[href="/account/security"]');
        expect(link).not.toBeNull();
    });

    it('without the permission to manage the factor, the restricted menu offers nothing (the API would deny it anyway)', () => {
        const fixture = render({ role: 'Owner', permissions: ['Customers.Read'], secondFactorEnrollmentRequired: true });

        expect(labels(fixture.nativeElement)).toEqual([]);
    });

    it('obeys what the API said, not the role name: a Technician told to enrol sees the restricted menu', () => {
        const fixture = render({ role: 'Technician', secondFactorEnrollmentRequired: true });

        expect(labels(fixture.nativeElement)).toEqual(['Mi cuenta', 'Seguridad']);
    });

    it('obeys what the API said, not the role name: an Owner who already has the factor sees the full menu', () => {
        const fixture = render({ role: 'Owner', secondFactorEnrollmentRequired: false, secondFactorRequired: true });

        expect(labels(fixture.nativeElement)).toEqual(jasmine.arrayContaining(['Inicio', 'Dashboard', 'Clientes', 'Trabajos', 'Agenda', 'Equipo', 'Seguridad']));
    });

    it('the menu follows the account WITHOUT navigating: it opens up once the factor is enrolled', () => {
        const session = TestBed.inject(CurrentSessionService);
        const fixture = render({ role: 'Owner', secondFactorEnrollmentRequired: true, secondFactorRequired: true });
        expect(labels(fixture.nativeElement)).toEqual(['Mi cuenta', 'Seguridad']);

        session.setAccount(buildAccount({ role: 'Owner', secondFactorEnrollmentRequired: false, secondFactorRequired: true }));
        fixture.detectChanges();

        expect(labels(fixture.nativeElement)).toContain('Clientes');
        expect(labels(fixture.nativeElement)).toContain('Dashboard');
    });

    it('and it closes when someone is promoted while inside (a fresh account that says they must enrol)', () => {
        const session = TestBed.inject(CurrentSessionService);
        const fixture = render({ role: 'Technician' });
        expect(labels(fixture.nativeElement)).toContain('Trabajos');

        session.setAccount(buildAccount({ role: 'Admin', secondFactorEnrollmentRequired: true, secondFactorRequired: true }));
        fixture.detectChanges();

        expect(labels(fixture.nativeElement)).toEqual(['Mi cuenta', 'Seguridad']);
    });
});
