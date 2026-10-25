import { TestBed } from '@angular/core/testing';
import { buildSessionToken } from '../testing/fake-jwt';
import { CurrentSessionService } from './current-session';

describe('CurrentSessionService', () => {
    let service: CurrentSessionService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(CurrentSessionService);
    });

    it('has no session before establish() is called', () => {
        expect(service.session()).toBeNull();
        expect(service.role()).toBeNull();
        expect(service.isExpired()).toBeTrue();
    });

    it('reads the user, tenant and role from the claims the API writes', () => {
        service.establish(buildSessionToken({ role: 'Technician' }));

        expect(service.session()?.userId).toBe('11111111-1111-1111-1111-111111111111');
        expect(service.tenantId()).toBe('22222222-2222-2222-2222-222222222222');
        expect(service.role()).toBe('Technician');
        expect(service.isExpired()).toBeFalse();
    });

    it('treats a token past its exp as expired', () => {
        service.establish(buildSessionToken({ exp: Math.floor(Date.now() / 1000) - 60 }));

        expect(service.isExpired()).toBeTrue();
    });

    it('rejects a token without the tenant claim instead of half-filling the session', () => {
        service.establish(buildSessionToken({ tenant_id: undefined }));

        expect(service.session()).toBeNull();
    });

    it('rejects a token that is not a JWT', () => {
        service.establish('not-a-jwt');

        expect(service.session()).toBeNull();
    });

    it('forgets everything on clear()', () => {
        service.establish(buildSessionToken());
        service.clear();

        expect(service.session()).toBeNull();
    });
});
