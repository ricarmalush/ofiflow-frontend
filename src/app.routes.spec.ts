import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, Route, Router, provideRouter } from '@angular/router';
import { AgendaComponent } from './app/features/agenda/pages/agenda/agenda.component';
import { CompanyProfileComponent } from './app/features/company/pages/company-profile/company-profile.component';
import { QuoteFormComponent } from './app/features/quotes/pages/quote-form/quote-form.component';
import { QuoteListComponent } from './app/features/quotes/pages/quote-list/quote-list.component';
import { CurrentSessionService } from './app/core/services/current-session';
import { buildAccount } from './app/core/testing/fake-account';
import { buildSessionToken } from './app/core/testing/fake-jwt';
import { secondFactorGuard } from './app/core/guards/second-factor.guard';
import { appRoutes } from './app.routes';

// La ruta de la agenda (spec 020 F1): existe una sola vez, carga la pantalla y exige Jobs.Read. El guard es solo interfaz (la API vuelve a
// comprobar el permiso en cada petición), pero una ruta sin guard enseñaría la pantalla a quien no puede usarla.
describe('app routes · agenda', () => {
    const layoutChildren = () => (appRoutes.find((route) => route.path === '' && route.children)?.children ?? []) as Route[];
    const agendaRoute = () => layoutChildren().find((route) => route.path === 'agenda');

    beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

    function enter(account: Parameters<typeof buildAccount>[0]): void {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount(account));
    }

    const canActivate = () => {
        const guards = agendaRoute()?.canActivate ?? [];
        expect(guards.length).toBe(1);
        return TestBed.runInInjectionContext(() => (guards[0] as (r: ActivatedRouteSnapshot, s: RouterStateSnapshot) => unknown)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    };

    it('exists once, inside the logged-in layout (so it also needs a session)', () => {
        expect(layoutChildren().filter((route) => route.path === 'agenda').length).toBe(1);
        const layout = appRoutes.find((route) => route.path === '' && route.children);
        expect(layout?.canActivate?.length).toBe(1);
    });

    it('loads the agenda screen', async () => {
        const loaded = await (agendaRoute()?.loadComponent as () => Promise<unknown>)();

        expect(loaded).toBe(AgendaComponent);
    });

    it('lets a role with Jobs.Read through (a Technician can read the agenda but not edit jobs)', () => {
        enter({ role: 'Technician' });

        expect(canActivate()).toBeTrue();
    });

    it('sends away someone who has Jobs.Write but not Jobs.Read: the route asks for READING', () => {
        enter({ role: 'Owner', permissions: ['Jobs.Write', 'Jobs.Schedule', 'Customers.Read'] });

        const result = canActivate() as UrlTree;
        expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/access');
    });

    it('denies while the account is not loaded (fail-closed)', () => {
        TestBed.inject(CurrentSessionService).establish(buildSessionToken({ role: 'Owner' }));

        expect(canActivate()).toBeInstanceOf(UrlTree);
    });
});

// La zona privada y el segundo factor obligatorio (spec 022): el guardián va en la ruta del layout y se aplica a TODAS las hijas.
describe('app routes · segundo factor obligatorio', () => {
    const layout = () => appRoutes.find((route) => route.path === '' && route.children) as Route;
    const security = () => (layout().children ?? []).find((route) => route.path === 'account/security') as Route;

    beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

    it('the logged-in layout applies the second-factor guard to every child route (canActivateChild), after authGuard', () => {
        expect(layout().canActivate?.length).toBe(1);
        expect(layout().canActivateChild).toEqual([secondFactorGuard]);
    });

    it('the security screen is a child of that layout (so the guard lets it through, not locks it)', () => {
        expect(security()).toBeDefined();
        expect(layout().children?.filter((route) => route.path === 'account/security').length).toBe(1);
    });

    it('end to end with the real route table: whoever must enrol can reach the security screen and nothing else', () => {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount({ role: 'Owner', secondFactorEnrollmentRequired: true, secondFactorRequired: true }));
        const guard = layout().canActivateChild![0] as (r: ActivatedRouteSnapshot, s: RouterStateSnapshot) => unknown;
        const run = (url: string) => TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));

        const children = (layout().children ?? []).filter((route) => route.path !== undefined);
        for (const route of children) {
            const url = '/' + route.path;
            if (route.path === 'account/security') {
                expect(run(url)).withContext(url).toBeTrue();
            } else {
                expect(TestBed.inject(Router).serializeUrl(run(url) as UrlTree))
                    .withContext(url)
                    .toBe('/account/security');
            }
        }
    });
});

// Las rutas de los presupuestos (spec 023): cada una con su permiso. El guard es solo interfaz (la API vuelve a comprobar el permiso en cada petición),
// pero una ruta sin guard enseñaría la pantalla a quien no puede usarla.
describe('app routes · quotes', () => {
    const layoutChildren = () => (appRoutes.find((route) => route.path === '' && route.children)?.children ?? []) as Route[];
    const routeOf = (path: string) => layoutChildren().find((route) => route.path === path);

    beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

    function enter(account: Parameters<typeof buildAccount>[0]): void {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount(account));
    }

    const canActivate = (path: string) => {
        const guards = routeOf(path)?.canActivate ?? [];
        expect(guards.length).toBe(1);
        return TestBed.runInInjectionContext(() => (guards[0] as (r: ActivatedRouteSnapshot, s: RouterStateSnapshot) => unknown)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    };

    it('the three routes exist once, inside the logged-in layout, and load their screens', async () => {
        for (const path of ['quotes', 'quotes/new', 'quotes/:id']) {
            expect(layoutChildren().filter((route) => route.path === path).length)
                .withContext(path)
                .toBe(1);
        }
        expect(await (routeOf('quotes')?.loadComponent as () => Promise<unknown>)()).toBe(QuoteListComponent);
        expect(await (routeOf('quotes/new')?.loadComponent as () => Promise<unknown>)()).toBe(QuoteFormComponent);
        expect(await (routeOf('quotes/:id')?.loadComponent as () => Promise<unknown>)()).toBe(QuoteFormComponent);
    });

    it('the list and a saved quote ask for READING; a new quote asks for WRITING', () => {
        enter({ role: 'Owner', permissions: ['Quotes.Read'] });

        expect(canActivate('quotes')).toBeTrue();
        expect(canActivate('quotes/:id')).toBeTrue();
        expect(canActivate('quotes/new')).toBeInstanceOf(UrlTree); // leer no basta para crear
    });

    it('someone with Quotes.Write but not Quotes.Read is sent away from the list', () => {
        enter({ role: 'Owner', permissions: ['Quotes.Write'] });

        expect(canActivate('quotes')).toBeInstanceOf(UrlTree);
        expect(canActivate('quotes/new')).toBeTrue();
    });

    it('a Technician (no quote permission at all) cannot enter any of them', () => {
        enter({ role: 'Technician' });

        for (const path of ['quotes', 'quotes/new', 'quotes/:id']) {
            expect(canActivate(path)).withContext(path).toBeInstanceOf(UrlTree);
        }
    });

    it('denies while the account is not loaded (fail-closed)', () => {
        TestBed.inject(CurrentSessionService).establish(buildSessionToken({ role: 'Owner' }));

        expect(canActivate('quotes')).toBeInstanceOf(UrlTree);
    });
});

// El perfil fiscal de la empresa (spec 024): una sola ruta, que exige LEER (Company.Read). Quien solo puede leer entra en modo lectura; modificar lo decide la pantalla (Company.Manage).
describe('app routes · company', () => {
    const layoutChildren = () => (appRoutes.find((route) => route.path === '' && route.children)?.children ?? []) as Route[];
    const companyRoute = () => layoutChildren().find((route) => route.path === 'company');

    beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

    function enter(account: Parameters<typeof buildAccount>[0]): void {
        const session = TestBed.inject(CurrentSessionService);
        session.establish(buildSessionToken());
        session.setAccount(buildAccount(account));
    }

    const canActivate = () => {
        const guards = companyRoute()?.canActivate ?? [];
        expect(guards.length).toBe(1);
        return TestBed.runInInjectionContext(() => (guards[0] as (r: ActivatedRouteSnapshot, s: RouterStateSnapshot) => unknown)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    };

    it('exists once, inside the logged-in layout (so it also needs a session and the second-factor guard), and loads the company screen', async () => {
        expect(layoutChildren().filter((route) => route.path === 'company').length).toBe(1);
        expect(appRoutes.find((route) => route.path === '' && route.children)?.canActivate?.length).toBe(1);

        const loaded = await (companyRoute()?.loadComponent as () => Promise<unknown>)();

        expect(loaded).toBe(CompanyProfileComponent);
    });

    it('lets in whoever has Company.Read: Owner, Admin, Manager and Employee', () => {
        for (const role of ['Owner', 'Admin', 'Manager', 'Employee'] as const) {
            TestBed.resetTestingModule();
            TestBed.configureTestingModule({ providers: [provideRouter([])] });
            enter({ role });

            expect(canActivate()).withContext(role).toBeTrue();
        }
    });

    it('sends a Technician to the access-denied screen', () => {
        enter({ role: 'Technician' });

        const result = canActivate() as UrlTree;
        expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/access');
    });

    it('sends away someone who has Company.Manage but not Company.Read: the route asks for READING', () => {
        enter({ role: 'Owner', permissions: ['Company.Manage', 'Customers.Read'] });

        expect(canActivate()).toBeInstanceOf(UrlTree);
    });

    it('denies while the account is not loaded (fail-closed)', () => {
        TestBed.inject(CurrentSessionService).establish(buildSessionToken({ role: 'Owner' }));

        expect(canActivate()).toBeInstanceOf(UrlTree);
    });
});
