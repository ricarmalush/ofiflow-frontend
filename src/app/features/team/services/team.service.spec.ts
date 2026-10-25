import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { OperationResult } from '../../../shared/models/result.model';
import { InvitationCreated, canManage } from '../../../shared/models/team-member.model';
import { buildInvitationLink } from '../pages/team/team.component';
import { readInvitationToken } from '../../../pages/auth/accept-invitation';
import { TeamService } from './team.service';

describe('TeamService', () => {
    let service: TeamService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(TeamService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('changes a role with the enum number the API expects', () => {
        service.changeRole('tu-1', 'Technician').subscribe();

        const req = httpMock.expectOne(`${environment.apiUrl}/users/tu-1/role`);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual({ role: 3 });
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('returns the one-time invitation token', () => {
        let result: OperationResult<InvitationCreated> | undefined;
        service.invite('ana@empresa.es', 'Employee').subscribe((r) => (result = r));

        const req = httpMock.expectOne(`${environment.apiUrl}/invitations`);
        expect(req.request.body).toEqual({ email: 'ana@empresa.es', role: 4 });
        req.flush({ id: 'inv-1', token: 'tok-abc', expiresAt: '2030-01-01T00:00:00Z' }, { status: 201, statusText: 'Created' });

        expect(result?.data?.token).toBe('tok-abc');
    });

    it('reports a hierarchy rejection (an Admin touching another Admin) without throwing', () => {
        let result: OperationResult | undefined;
        service.remove('tu-admin').subscribe((r) => (result = r));

        httpMock.expectOne(`${environment.apiUrl}/users/tu-admin`).flush({ status: 403, detail: 'No puedes gestionar a este miembro.', code: 'auth.forbidden' }, { status: 403, statusText: 'Forbidden' });

        expect(result?.isSuccess).toBeFalse();
        expect(result?.message).toBe('No puedes gestionar a este miembro.');
    });
});

describe('role hierarchy (mirror of ManageableRoles)', () => {
    it('the Owner manages everyone but the Owner', () => {
        expect(canManage('Owner', 'Admin')).toBeTrue();
        expect(canManage('Owner', 'Owner')).toBeFalse();
    });

    it('an Admin does not manage other Admins', () => {
        expect(canManage('Admin', 'Manager')).toBeTrue();
        expect(canManage('Admin', 'Admin')).toBeFalse();
    });

    it('a Manager manages nobody', () => {
        expect(canManage('Manager', 'Employee')).toBeFalse();
    });

    it('no role, no management', () => {
        expect(canManage(null, 'Employee')).toBeFalse();
    });
});

describe('invitation link', () => {
    it('carries the token in the fragment, which browsers never send to a server', () => {
        const link = buildInvitationLink('a+b/c=', 'https://app.ofiflow.test');

        expect(link).toBe('https://app.ofiflow.test/auth/accept-invitation#token=a%2Bb%2Fc%3D');
        expect(new URL(link).search).toBe('');
    });

    it('round-trips through the accept page reader', () => {
        const link = buildInvitationLink('a+b/c=', 'https://app.ofiflow.test');

        expect(readInvitationToken(new URL(link).hash)).toBe('a+b/c=');
    });

    it('reads nothing from an empty fragment', () => {
        expect(readInvitationToken('')).toBeNull();
    });
});
