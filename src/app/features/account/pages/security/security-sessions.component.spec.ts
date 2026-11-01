import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Confirmation, ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { PERMISSIONS_OF, buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { TenantRole } from '../../../../shared/models/auth.model';
import { SessionInfo } from '../../../../shared/models/session.model';
import { SecurityComponent } from './security.component';

const mfaUrl = `${environment.apiUrl}/account/mfa`;
const sessionsUrl = `${environment.apiUrl}/account/sessions`;
const noContent = { status: 204, statusText: 'No Content' };

function buildSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
    return {
        id: '00000000-0000-0000-0000-000000000001',
        device: 'Chrome en Windows',
        startedAt: '2026-11-01T08:00:00Z',
        lastActiveAt: '2026-11-01T09:30:00Z',
        approximateIp: '203.0.113.0',
        current: false,
        ...overrides
    };
}

const CURRENT = buildSession({ id: '00000000-0000-0000-0000-00000000000c', device: 'Chrome en Windows', current: true });
const PHONE = buildSession({ id: '00000000-0000-0000-0000-0000000000a1', device: 'Safari en iPhone', approximateIp: '198.51.100.0' });
const OLD = buildSession({ id: '00000000-0000-0000-0000-0000000000b2', device: 'Dispositivo desconocido', approximateIp: null });

describe('SecurityComponent · ver y cerrar mis sesiones (spec 016)', () => {
    let httpMock: HttpTestingController;
    let fixture: ComponentFixture<SecurityComponent>;
    let confirm: jasmine.Spy;
    let navigate: jasmine.Spy;
    let session: CurrentSessionService;

    const listRequests = (): TestRequest[] => httpMock.match((r) => r.url === sessionsUrl && r.method === 'GET');

    // Monta la pantalla; responde al MFA y a la primera petición de la lista con `sessions` (o con un error si es null).
    function open(permissions: string[] | null, sessions: SessionInfo[] | null = [CURRENT, PHONE]): HTMLElement {
        const auth = TestBed.inject(AuthService);
        auth.storeSession({ accessToken: buildSessionToken(), refreshToken: 'refresh-1', expiresAt: '2030-01-01T00:00:00Z' });
        session = TestBed.inject(CurrentSessionService);
        if (permissions) session.setAccount(buildAccount({ permissions }));

        fixture = TestBed.createComponent(SecurityComponent);
        fixture.detectChanges();
        httpMock.expectOne(mfaUrl).flush({ enabled: false, setupPending: false, recoveryCodesRemaining: 0 });
        listRequests().forEach((r) => (sessions ? r.flush(sessions) : r.flush({ detail: 'No se pudo cargar.' }, { status: 500, statusText: 'Server Error' })));
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    const rows = (host: HTMLElement) => Array.from(host.querySelectorAll('ul[aria-label="Mis sesiones"] li'));
    const rowOf = (host: HTMLElement, device: string) => rows(host).find((li) => li.textContent?.includes(device)) as HTMLElement;
    const buttonIn = (row: Element) => row.querySelector('button') as HTMLButtonElement;
    const lastConfirmation = (): Confirmation => confirm.calls.mostRecent().args[0];

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), MessageService, ConfirmationService] });
        httpMock = TestBed.inject(HttpTestingController);
        confirm = spyOn(TestBed.inject(ConfirmationService), 'confirm');
        navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

    describe('la lista', () => {
        it('pide GET /account/sessions al abrir la pantalla', () => {
            // open() ya consume la petición; este test comprueba que existe y es un GET sin parámetros.
            const auth = TestBed.inject(AuthService);
            auth.storeSession({ accessToken: buildSessionToken(), refreshToken: 'refresh-1', expiresAt: '2030-01-01T00:00:00Z' });
            TestBed.inject(CurrentSessionService).setAccount(buildAccount({ permissions: PERMISSIONS_OF.Owner }));
            fixture = TestBed.createComponent(SecurityComponent);
            fixture.detectChanges();
            httpMock.expectOne(mfaUrl).flush({ enabled: false, setupPending: false, recoveryCodesRemaining: 0 });

            const [request, ...others] = listRequests();

            expect(request.request.method).toBe('GET');
            expect(request.request.params.keys()).toEqual([]);
            expect(others).toEqual([]);
            request.flush([]);
        });

        it('muestra cada sesión con su dispositivo, en el orden que manda la API', () => {
            const host = open(PERMISSIONS_OF.Owner, [PHONE, CURRENT, OLD]);

            expect(rows(host).map((li) => li.querySelector('.font-medium')?.textContent?.trim())).toEqual(['Safari en iPhone', 'Chrome en Windows', 'Dispositivo desconocido']);
        });

        it('marca «Esta sesión» solo en la actual', () => {
            const host = open(PERMISSIONS_OF.Owner, [PHONE, CURRENT, OLD]);

            expect(rowOf(host, 'Chrome en Windows').textContent).toContain('Esta sesión');
            expect(rowOf(host, 'Safari en iPhone').textContent).not.toContain('Esta sesión');
            expect(rowOf(host, 'Dispositivo desconocido').textContent).not.toContain('Esta sesión');
            expect(host.textContent!.match(/Esta sesión/g)?.length).toBe(1);
        });

        it('muestra la red aproximada, y nada si la sesión es anterior y no la tiene', () => {
            const host = open(PERMISSIONS_OF.Owner, [PHONE, OLD]);

            expect(rowOf(host, 'Safari en iPhone').textContent).toContain('Red aproximada: 198.51.100.0');
            expect(rowOf(host, 'Dispositivo desconocido').textContent).not.toContain('Red aproximada');
        });

        it('muestra cuándo empezó y su última actividad', () => {
            const host = open(PERMISSIONS_OF.Owner, [buildSession({ startedAt: '2026-11-01T08:05:00', lastActiveAt: '2026-11-01T09:30:00' })]);

            expect(rows(host)[0].textContent).toContain('Empezó el 01/11/2026 08:05');
            expect(rows(host)[0].textContent).toContain('Última actividad 01/11/2026 09:30');
        });

        it('un dispositivo con HTML se pinta como texto, nunca como elementos', () => {
            const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
            const host = open(PERMISSIONS_OF.Owner, [buildSession({ device: hostile })]);

            expect(host.querySelector('ul img')).toBeNull();
            expect(host.querySelector('ul script')).toBeNull();
            expect(rows(host)[0].textContent).toContain(hostile);
        });

        it('mientras carga lo dice, y si la carga falla muestra el error y ninguna lista', () => {
            const host = open(PERMISSIONS_OF.Owner, null);

            expect(host.textContent).toContain('No se pudo cargar.');
            expect(rows(host).length).toBe(0);
        });

        it('los cinco roles ven su lista', () => {
            (Object.keys(PERMISSIONS_OF) as TenantRole[]).forEach((role) => {
                TestBed.resetTestingModule();
                sessionStorage.clear();
                TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), MessageService, ConfirmationService] });
                httpMock = TestBed.inject(HttpTestingController);
                confirm = spyOn(TestBed.inject(ConfirmationService), 'confirm');

                const host = open(PERMISSIONS_OF[role]);

                expect(rows(host).length).withContext(role).toBe(2);
            });
        });
    });

    describe('quién ve qué (los dos permisos son independientes)', () => {
        it('solo Account.Read: ve la lista pero no puede cerrar nada', () => {
            const host = open(['Account.Read']);

            expect(rows(host).length).toBe(2);
            expect(host.querySelectorAll('ul button').length).toBe(0);
            expect(host.textContent).not.toContain('Cerrar todas mis sesiones');
        });

        it('solo Account.CloseSessions: no ve la lista ni se pide, pero sí «Cerrar todas»', () => {
            const host = open(['Account.CloseSessions']);

            expect(host.querySelector('ul[aria-label="Mis sesiones"]')).toBeNull();
            expect(host.textContent).toContain('Cerrar todas mis sesiones');
            httpMock.expectNone(sessionsUrl);
        });

        it('con los dos: lista, un «Cerrar» por sesión y «Cerrar todas»', () => {
            const host = open(['Account.Read', 'Account.CloseSessions']);

            expect(rows(host).length).toBe(2);
            expect(rows(host).every((li) => li.querySelector('button'))).toBeTrue();
            expect(host.textContent).toContain('Cerrar todas mis sesiones');
        });

        it('la cuenta puede cargarse DESPUÉS que la pantalla: la lista se pide en cuanto hay permiso', () => {
            const host = open(null);
            httpMock.expectNone(sessionsUrl);

            session.setAccount(buildAccount({ permissions: PERMISSIONS_OF.Owner }));
            fixture.detectChanges();
            listRequests().forEach((r) => r.flush([CURRENT]));
            fixture.detectChanges();

            expect(rows(host).length).toBe(1);
        });
    });

    describe('cerrar OTRA sesión', () => {
        it('no pide confirmación: envía DELETE /account/sessions/{id} con el Id de ESA fila', () => {
            const host = open(PERMISSIONS_OF.Owner);

            buttonIn(rowOf(host, 'Safari en iPhone')).click();

            expect(confirm).not.toHaveBeenCalled();
            const request = httpMock.expectOne(`${sessionsUrl}/${PHONE.id}`);
            expect(request.request.method).toBe('DELETE');
            request.flush(null, noContent);
            listRequests().forEach((r) => r.flush([CURRENT]));
        });

        it('con éxito vuelve a pedir la lista, la fila desaparece y esta sesión sigue', () => {
            const host = open(PERMISSIONS_OF.Owner);

            buttonIn(rowOf(host, 'Safari en iPhone')).click();
            httpMock.expectOne(`${sessionsUrl}/${PHONE.id}`).flush(null, noContent);
            const reload = listRequests();
            expect(reload.length).toBe(1);
            reload[0].flush([CURRENT]);
            fixture.detectChanges();

            expect(rows(host).length).toBe(1);
            expect(host.textContent).not.toContain('Safari en iPhone');
            expect(TestBed.inject(AuthService).getToken()).not.toBeNull();
            expect(navigate).not.toHaveBeenCalled();
        });

        it('si falla, lo dice, no toca lo local y vuelve a leer la lista (puede estar desfasada)', () => {
            const host = open(PERMISSIONS_OF.Owner);

            buttonIn(rowOf(host, 'Safari en iPhone')).click();
            httpMock.expectOne(`${sessionsUrl}/${PHONE.id}`).flush({ code: 'session.not_found', detail: 'No se ha encontrado la sesión.' }, { status: 404, statusText: 'Not Found' });
            listRequests().forEach((r) => r.flush([CURRENT]));
            fixture.detectChanges();

            expect(host.textContent).toContain('No se ha encontrado la sesión.');
            expect(rows(host).length).toBe(1);
            expect(TestBed.inject(AuthService).getToken()).not.toBeNull();
            expect(navigate).not.toHaveBeenCalled();
        });

        it('un error de red tampoco cambia nada local y deja volver a intentarlo', () => {
            const host = open(PERMISSIONS_OF.Owner);

            buttonIn(rowOf(host, 'Safari en iPhone')).click();
            httpMock.expectOne(`${sessionsUrl}/${PHONE.id}`).error(new ProgressEvent('error'));
            listRequests().forEach((r) => r.flush([CURRENT, PHONE]));
            fixture.detectChanges();

            expect(rows(host).length).toBe(2);
            expect(buttonIn(rowOf(host, 'Safari en iPhone')).disabled).toBeFalse();
            expect(navigate).not.toHaveBeenCalled();
        });

        it('al reintentar se borra el error anterior', () => {
            const host = open(PERMISSIONS_OF.Owner);
            buttonIn(rowOf(host, 'Safari en iPhone')).click();
            httpMock.expectOne(`${sessionsUrl}/${PHONE.id}`).flush({ detail: 'Demasiadas peticiones.' }, { status: 429, statusText: 'Too Many Requests' });
            listRequests().forEach((r) => r.flush([CURRENT, PHONE]));
            fixture.detectChanges();
            expect(host.textContent).toContain('Demasiadas peticiones.');

            buttonIn(rowOf(host, 'Safari en iPhone')).click();
            fixture.detectChanges();

            expect(host.textContent).not.toContain('Demasiadas peticiones.');
            httpMock.expectOne(`${sessionsUrl}/${PHONE.id}`);
        });

        it('mientras se cierra una, todos los botones quedan ocupados y no sale una segunda petición', () => {
            const host = open(PERMISSIONS_OF.Owner, [CURRENT, PHONE, OLD]);

            buttonIn(rowOf(host, 'Safari en iPhone')).click();
            fixture.detectChanges();

            expect(rows(host).every((li) => buttonIn(li).disabled)).toBeTrue();
            const allButton = Array.from(host.querySelectorAll('p-button')).find((b) => b.textContent?.includes('Cerrar todas mis sesiones'))!.querySelector('button')!;
            expect(allButton.disabled).toBeTrue();
            fixture.componentInstance.closeSession(OLD);
            fixture.componentInstance.confirmCloseAllSessions();
            expect(confirm).not.toHaveBeenCalled();
            httpMock.expectOne(`${sessionsUrl}/${PHONE.id}`);
        });
    });

    describe('cerrar ESTA sesión', () => {
        const closeCurrent = (host: HTMLElement) => buttonIn(rowOf(host, 'Chrome en Windows')).click();

        it('el botón de la actual lo dice claro y pide confirmación SIN enviar nada todavía', () => {
            const host = open(PERMISSIONS_OF.Owner);
            expect(rowOf(host, 'Chrome en Windows').textContent).toContain('Cerrar esta sesión');
            expect(rowOf(host, 'Safari en iPhone').textContent).not.toContain('Cerrar esta sesión');

            closeCurrent(host);

            expect(confirm).toHaveBeenCalledTimes(1);
            expect(lastConfirmation().header).toBe('Cerrar esta sesión');
            expect(lastConfirmation().message).toContain('volver a entrar');
            httpMock.expectNone(`${sessionsUrl}/${CURRENT.id}`);
        });

        it('si se cancela no se llama a la API y la sesión sigue', () => {
            const host = open(PERMISSIONS_OF.Owner);

            closeCurrent(host);
            lastConfirmation().reject?.();

            httpMock.expectNone(`${sessionsUrl}/${CURRENT.id}`);
            expect(TestBed.inject(AuthService).getToken()).not.toBeNull();
            expect(navigate).not.toHaveBeenCalled();
        });

        it('al aceptar envía DELETE con el Id de la actual y, con éxito, borra lo local y lleva al login con el aviso', () => {
            const host = open(PERMISSIONS_OF.Owner);

            closeCurrent(host);
            lastConfirmation().accept?.();
            const request = httpMock.expectOne(`${sessionsUrl}/${CURRENT.id}`);
            expect(request.request.method).toBe('DELETE');
            request.flush(null, noContent);

            expect(TestBed.inject(AuthService).getToken()).toBeNull();
            expect(TestBed.inject(AuthService).getRefreshToken()).toBeNull();
            expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], { state: { info: 'Se cerró esta sesión. Vuelve a entrar.' } });
            // Ya no hay sesión: no se vuelve a pedir la lista con un token muerto.
            httpMock.expectNone(sessionsUrl);
        });

        it('si el servidor falla, la persona sigue dentro y se le dice', () => {
            const host = open(PERMISSIONS_OF.Owner);

            closeCurrent(host);
            lastConfirmation().accept?.();
            httpMock.expectOne(`${sessionsUrl}/${CURRENT.id}`).flush({ detail: 'Demasiadas peticiones.' }, { status: 429, statusText: 'Too Many Requests' });
            listRequests().forEach((r) => r.flush([CURRENT, PHONE]));
            fixture.detectChanges();

            expect(host.textContent).toContain('Demasiadas peticiones.');
            expect(TestBed.inject(AuthService).getToken()).not.toBeNull();
            expect(navigate).not.toHaveBeenCalled();
        });
    });
});
