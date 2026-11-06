import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, Route, Router, provideRouter } from '@angular/router';
import { AgendaComponent } from './app/features/agenda/pages/agenda/agenda.component';
import { CurrentSessionService } from './app/core/services/current-session';
import { buildAccount } from './app/core/testing/fake-account';
import { buildSessionToken } from './app/core/testing/fake-jwt';
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
