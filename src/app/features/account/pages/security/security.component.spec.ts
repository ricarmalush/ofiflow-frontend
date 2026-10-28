import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Confirmation, ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { PERMISSIONS_OF, buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { TenantRole } from '../../../../shared/models/auth.model';
import { SecurityComponent } from './security.component';

const mfaUrl = `${environment.apiUrl}/account/mfa`;
const sessionsUrl = `${environment.apiUrl}/account/sessions`;

describe('SecurityComponent · cerrar todas mis sesiones (spec 014)', () => {
    let httpMock: HttpTestingController;
    let fixture: ComponentFixture<SecurityComponent>;
    let confirm: jasmine.Spy;
    let navigate: jasmine.Spy;
    let session: CurrentSessionService;

    // Monta la pantalla con la cuenta indicada (null = la cuenta aún no se ha cargado) y responde al estado del MFA.
    function open(permissions: string[] | null): HTMLElement {
        // AuthService restaura la sesión de sessionStorage al crearse (y la vacía si no hay): se crea ANTES de poner la cuenta.
        const auth = TestBed.inject(AuthService);
        auth.storeSession({ accessToken: buildSessionToken(), refreshToken: 'refresh-1', expiresAt: '2030-01-01T00:00:00Z' });
        session = TestBed.inject(CurrentSessionService);
        if (permissions) session.setAccount(buildAccount({ permissions }));

        fixture = TestBed.createComponent(SecurityComponent);
        fixture.detectChanges();
        httpMock.expectOne(mfaUrl).flush({ enabled: false, setupPending: false, recoveryCodesRemaining: 0 });
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    const closeButton = (host: HTMLElement) => Array.from(host.querySelectorAll('p-button')).find((b) => b.textContent?.includes('Cerrar todas mis sesiones'))?.querySelector('button') ?? null;
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

    describe('quién ve el botón', () => {
        (Object.keys(PERMISSIONS_OF) as TenantRole[]).forEach((role) => {
            it(`${role}: lo ve (los cinco roles tienen Account.CloseSessions)`, () => {
                const host = open(PERMISSIONS_OF[role]);

                expect(closeButton(host)).not.toBeNull();
            });
        });

        it('sin el permiso no hay botón ni la sección «Sesiones»', () => {
            const host = open(['Account.Read', 'Mfa.Manage']);

            expect(closeButton(host)).toBeNull();
            expect(host.textContent).not.toContain('Sesiones');
        });

        it('mientras la cuenta no se ha cargado no hay botón (ante la duda, la interfaz no ofrece nada)', () => {
            const host = open(null);

            expect(closeButton(host)).toBeNull();
        });

        it('sigue un cambio de rol sin recargar: aparece al ganar el permiso y desaparece al perderlo', () => {
            const host = open(['Account.Read', 'Mfa.Manage']);
            expect(closeButton(host)).toBeNull();

            session.setAccount(buildAccount({ permissions: ['Account.Read', 'Mfa.Manage', 'Account.CloseSessions'] }));
            fixture.detectChanges();
            expect(closeButton(host)).not.toBeNull();

            session.setAccount(buildAccount({ permissions: ['Account.Read', 'Mfa.Manage'] }));
            fixture.detectChanges();
            expect(closeButton(host)).toBeNull();
        });

        it('el botón de las sesiones no depende de Mfa.Manage ni de Account.Read: solo de Account.CloseSessions', () => {
            const host = open(['Account.CloseSessions']);

            expect(closeButton(host)).not.toBeNull();
        });
    });

    describe('la confirmación', () => {
        it('pulsar el botón pide confirmación y NO envía nada todavía', () => {
            const host = open(PERMISSIONS_OF.Owner);

            closeButton(host)!.click();

            expect(confirm).toHaveBeenCalledTimes(1);
            expect(lastConfirmation().header).toBe('Cerrar todas mis sesiones');
            expect(lastConfirmation().message).toContain('también en este');
            httpMock.expectNone(sessionsUrl);
        });

        it('si la confirmación se cancela no se llama a la API y la sesión sigue', () => {
            const host = open(PERMISSIONS_OF.Owner);

            closeButton(host)!.click();
            // Cancelar = no ejecutar accept(): el diálogo solo llama a reject, que aquí no hace nada.
            lastConfirmation().reject?.();

            httpMock.expectNone(sessionsUrl);
            expect(TestBed.inject(AuthService).getToken()).not.toBeNull();
            expect(navigate).not.toHaveBeenCalled();
        });
    });

    describe('al aceptar', () => {
        function accept(host: HTMLElement): void {
            closeButton(host)!.click();
            lastConfirmation().accept?.();
            fixture.detectChanges();
        }

        it('envía DELETE /account/sessions', () => {
            accept(open(PERMISSIONS_OF.Owner));

            const request = httpMock.expectOne(sessionsUrl);
            expect(request.request.method).toBe('DELETE');
            request.flush(null, { status: 204, statusText: 'No Content' });
        });

        it('con éxito borra lo local y lleva al login con el aviso', () => {
            accept(open(PERMISSIONS_OF.Owner));

            httpMock.expectOne(sessionsUrl).flush(null, { status: 204, statusText: 'No Content' });

            expect(TestBed.inject(AuthService).getToken()).toBeNull();
            expect(TestBed.inject(AuthService).getRefreshToken()).toBeNull();
            expect(navigate).toHaveBeenCalledOnceWith(['/auth/login'], { state: { info: 'Se cerraron todas tus sesiones. Vuelve a entrar.' } });
        });

        it('con error del servidor NO cierra lo local, lo dice y deja volver a intentarlo', () => {
            const host = open(PERMISSIONS_OF.Owner);
            accept(host);

            httpMock.expectOne(sessionsUrl).flush({ detail: 'Demasiadas peticiones.' }, { status: 429, statusText: 'Too Many Requests' });
            fixture.detectChanges();

            expect(host.textContent).toContain('Demasiadas peticiones.');
            expect(TestBed.inject(AuthService).getToken()).not.toBeNull();
            expect(navigate).not.toHaveBeenCalled();
            expect(closeButton(host)!.disabled).toBeFalse();
        });

        it('al reintentar se borra el error anterior', () => {
            const host = open(PERMISSIONS_OF.Owner);
            accept(host);
            httpMock.expectOne(sessionsUrl).flush({ detail: 'Demasiadas peticiones.' }, { status: 429, statusText: 'Too Many Requests' });
            fixture.detectChanges();
            expect(host.textContent).toContain('Demasiadas peticiones.');

            accept(host);

            expect(host.textContent).not.toContain('Demasiadas peticiones.');
            httpMock.expectOne(sessionsUrl);
        });

        it('sin red tampoco cierra lo local', () => {
            accept(open(PERMISSIONS_OF.Owner));

            httpMock.expectOne(sessionsUrl).error(new ProgressEvent('error'));

            expect(TestBed.inject(AuthService).getToken()).not.toBeNull();
            expect(navigate).not.toHaveBeenCalled();
        });

        it('mientras la petición está en curso el botón está ocupado y una segunda confirmación no envía otra', () => {
            const host = open(PERMISSIONS_OF.Owner);
            accept(host);
            expect(closeButton(host)!.disabled).toBeTrue();

            // Aunque se forzara otra confirmación, no sale una segunda petición.
            fixture.componentInstance.confirmCloseAllSessions();
            expect(confirm).toHaveBeenCalledTimes(1);

            httpMock.expectOne(sessionsUrl);
        });
    });
});
