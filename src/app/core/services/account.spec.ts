import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CurrentAccount } from '../../shared/models/account.model';
import { buildSessionToken } from '../testing/fake-jwt';
import { AccountService } from './account';
import { CurrentSessionService } from './current-session';

const technician: CurrentAccount = {
    userId: '11111111-1111-1111-1111-111111111111',
    membershipId: '33333333-3333-3333-3333-333333333333',
    name: 'Ana Pérez',
    email: 'ana@empresa.com',
    tenantId: '22222222-2222-2222-2222-222222222222',
    tenantName: 'Fontanería Demo',
    role: 'Technician',
    permissions: ['Account.Read', 'Customers.Read', 'Jobs.Execute', 'Jobs.Read', 'Mfa.Manage']
};

describe('AccountService', () => {
    let service: AccountService;
    let session: CurrentSessionService;
    let httpMock: HttpTestingController;
    const url = `${environment.apiUrl}/account/me`;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(AccountService);
        session = TestBed.inject(CurrentSessionService);
        httpMock = TestBed.inject(HttpTestingController);
        session.establish(buildSessionToken());
    });

    afterEach(() => httpMock.verify());

    it('puts what the API says into the session: the role, the permissions and the membership id', () => {
        let loaded: boolean | undefined;
        service.load().subscribe((ok) => (loaded = ok));

        httpMock.expectOne(url).flush(technician);

        expect(loaded).toBeTrue();
        expect(session.role()).toBe('Technician');
        expect(session.membershipId()).toBe('33333333-3333-3333-3333-333333333333');
        expect(session.account()?.tenantName).toBe('Fontanería Demo');
        expect(session.can('Jobs.Execute')).toBeTrue();
        expect(session.can('Customers.Write')).toBeFalse();
    });

    it('the permissions come from the API, not from a table: a permission the API did not give is denied even if the role would have it', () => {
        service.load().subscribe();

        httpMock.expectOne(url).flush({ ...technician, role: 'Owner', permissions: ['Customers.Read'] });

        expect(session.role()).toBe('Owner');
        expect(session.can('Customers.Delete')).toBeFalse(); // un Owner "de verdad" lo tendría; aquí manda lo que dijo la API
        expect(session.can('Customers.Read')).toBeTrue();
    });

    it('the role is the effective one, not the token one: the token says Technician and the API says Manager', () => {
        session.establish(buildSessionToken({ role: 'Technician' }));
        service.load().subscribe();

        httpMock.expectOne(url).flush({ ...technician, role: 'Manager', permissions: ['Account.Read', 'Jobs.Assign'] });

        expect(session.session()?.tokenRole).toBe('Technician');
        expect(session.role()).toBe('Manager');
        expect(session.can('Jobs.Assign')).toBeTrue();
    });

    it('with no account loaded nobody can do anything (fail-closed)', () => {
        expect(session.role()).toBeNull();
        expect(session.can('Account.Read')).toBeFalse();
        expect(session.can('Customers.Read')).toBeFalse();
    });

    it('sends a single request when several callers ask at once', () => {
        const results: boolean[] = [];
        service.load().subscribe((ok) => results.push(ok));
        service.load().subscribe((ok) => results.push(ok));
        service.ensureLoaded().subscribe((ok) => results.push(ok));

        httpMock.expectOne(url).flush(technician);

        expect(results).toEqual([true, true, true]);
    });

    it('ensureLoaded does not ask again when the account is already there', () => {
        session.setAccount(technician);
        let loaded: boolean | undefined;

        service.ensureLoaded().subscribe((ok) => (loaded = ok));

        httpMock.expectNone(url);
        expect(loaded).toBeTrue();
    });

    it('a failed load answers false and keeps the account it already had (a network blip must not strip the permissions)', () => {
        session.setAccount(technician);
        let loaded: boolean | undefined;
        service.load().subscribe((ok) => (loaded = ok));

        httpMock.expectOne(url).flush({ code: 'server.unexpected' }, { status: 500, statusText: 'Server Error' });

        expect(loaded).toBeFalse();
        expect(session.can('Jobs.Execute')).toBeTrue();
        expect(session.role()).toBe('Technician');
    });

    it('a failed first load answers false and leaves no permissions', () => {
        let loaded: boolean | undefined;
        service.ensureLoaded().subscribe((ok) => (loaded = ok));

        httpMock.expectOne(url).error(new ProgressEvent('error'));

        expect(loaded).toBeFalse();
        expect(session.can('Account.Read')).toBeFalse();
    });

    it('asks again after a request finished (it is not cached forever)', () => {
        service.load().subscribe();
        httpMock.expectOne(url).flush(technician);

        service.load().subscribe();
        httpMock.expectOne(url).flush({ ...technician, role: 'Manager' });

        expect(session.role()).toBe('Manager');
    });
});
