import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { CurrentSessionService } from '../services/current-session';
import { buildSessionToken } from '../testing/fake-jwt';
import { permissionGuard } from './permission.guard';

describe('permissionGuard', () => {
    const run = () => TestBed.runInInjectionContext(() => permissionGuard('Customers.Write')({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

    beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

    it('lets a role with the permission through', () => {
        TestBed.inject(CurrentSessionService).establish(buildSessionToken({ role: 'Employee' }));

        expect(run()).toBeTrue();
    });

    it('sends a role without it to the access-denied page', () => {
        TestBed.inject(CurrentSessionService).establish(buildSessionToken({ role: 'Technician' }));

        const result = run() as UrlTree;
        expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/access');
    });
});
