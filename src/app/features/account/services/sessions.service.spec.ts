import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { OperationResult } from '../../../shared/models/result.model';
import { SessionInfo } from '../../../shared/models/session.model';
import { SessionsService } from './sessions.service';

describe('SessionsService (spec 016)', () => {
    let service: SessionsService;
    let httpMock: HttpTestingController;
    const url = `${environment.apiUrl}/account/sessions`;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(SessionsService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('asks GET /account/sessions with no parameters: the account comes from the token', () => {
        service.list().subscribe();

        const request = httpMock.expectOne(url);
        expect(request.request.method).toBe('GET');
        expect(request.request.params.keys()).toEqual([]);
        request.flush([]);
    });

    it('returns the sessions exactly as the API sends them', () => {
        const sessions: SessionInfo[] = [
            { id: 'a', device: 'Chrome en Windows', startedAt: '2026-11-01T08:00:00Z', lastActiveAt: '2026-11-01T09:00:00Z', approximateIp: '203.0.113.0', current: true },
            { id: 'b', device: 'Dispositivo desconocido', startedAt: '2026-10-30T08:00:00Z', lastActiveAt: '2026-10-30T08:00:00Z', approximateIp: null, current: false }
        ];
        let result: OperationResult<SessionInfo[]> | undefined;

        service.list().subscribe((r) => (result = r));
        httpMock.expectOne(url).flush(sessions);

        expect(result?.isSuccess).toBeTrue();
        expect(result?.data).toEqual(sessions);
    });

    it('turns a server error into a failed result and never throws', () => {
        let result: OperationResult<SessionInfo[]> | undefined;

        service.list().subscribe((r) => (result = r));
        httpMock.expectOne(url).flush({ detail: 'Algo falló.' }, { status: 500, statusText: 'Server Error' });

        expect(result?.isSuccess).toBeFalse();
        expect(result?.message).toBe('Algo falló.');
    });

    it('turns "no network" into a failed result', () => {
        let result: OperationResult<SessionInfo[]> | undefined;

        service.list().subscribe((r) => (result = r));
        httpMock.expectOne(url).error(new ProgressEvent('error'));

        expect(result?.isSuccess).toBeFalse();
    });

    it('does not retry on its own', () => {
        service.list().subscribe();
        httpMock.expectOne(url).error(new ProgressEvent('error'));

        httpMock.expectNone(url);
    });
});
