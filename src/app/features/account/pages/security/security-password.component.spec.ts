import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { ChangePasswordComponent } from './change-password.component';
import { SecurityComponent } from './security.component';

const mfaUrl = `${environment.apiUrl}/account/mfa`;
const sessionsUrl = `${environment.apiUrl}/account/sessions`;

// La tarjeta «Cambiar contraseña» dentro de la pantalla de seguridad (spec 019): quién la ve, qué sabe del segundo factor y qué hace la pantalla cuando la contraseña cambia.
describe('SecurityComponent · cambiar la contraseña (spec 019)', () => {
    let httpMock: HttpTestingController;
    let fixture: ComponentFixture<SecurityComponent>;
    let session: CurrentSessionService;

    const enabledStatus = { enabled: true, setupPending: false, recoveryCodesRemaining: 10 };
    const disabledStatus = { enabled: false, setupPending: false, recoveryCodesRemaining: 0 };

    function open(account: Parameters<typeof buildAccount>[0], status = disabledStatus): HTMLElement {
        const auth = TestBed.inject(AuthService);
        auth.storeSession({ accessToken: buildSessionToken(), refreshToken: 'refresh-1', expiresAt: '2030-01-01T00:00:00Z' });
        session = TestBed.inject(CurrentSessionService);
        session.setAccount(buildAccount(account));

        fixture = TestBed.createComponent(SecurityComponent);
        fixture.detectChanges();
        httpMock.expectOne(mfaUrl).flush(status);
        httpMock.match((r) => r.url === sessionsUrl && r.method === 'GET').forEach((r) => r.flush([]));
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    const card = (host: HTMLElement) => host.querySelector('app-change-password');
    const cardComponent = () => fixture.debugElement.query(By.directive(ChangePasswordComponent)).componentInstance as ChangePasswordComponent;

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), MessageService, ConfirmationService] });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

    describe('quién ve la tarjeta', () => {
        for (const role of ['Owner', 'Admin', 'Manager', 'Technician', 'Employee'] as const) {
            it(`${role}: la ve (los cinco roles tienen Account.ChangePassword)`, () => {
                const host = open({ role });

                expect(card(host)).not.toBeNull();
            });
        }

        it('sin el permiso Account.ChangePassword no hay tarjeta (la API daría 403)', () => {
            const host = open({ role: 'Owner', permissions: ['Account.Read', 'Account.CloseSessions', 'Mfa.Manage'] });

            expect(card(host)).toBeNull();
        });

        it('quien debe activar el segundo factor no la ve: la API se lo denegaría, primero activa el factor', () => {
            const host = open({ role: 'Owner', secondFactorEnrollmentRequired: true, secondFactorRequired: true });

            expect(card(host)).toBeNull();
        });

        it('obedece lo que dijo la API, no el nombre del rol: un Technician al que la API dice que debe activar tampoco la ve', () => {
            const host = open({ role: 'Technician', secondFactorEnrollmentRequired: true });

            expect(card(host)).toBeNull();
        });

        it('aparece sola cuando la cuenta ya no tiene que activar el factor (sin recargar)', () => {
            const host = open({ role: 'Owner', secondFactorEnrollmentRequired: true, secondFactorRequired: true });
            expect(card(host)).toBeNull();

            session.setAccount(buildAccount({ role: 'Owner', secondFactorEnrollmentRequired: false, secondFactorRequired: true }));
            fixture.detectChanges();
            httpMock.match((r) => r.url === sessionsUrl).forEach((r) => r.flush([]));
            fixture.detectChanges();

            expect(card(host)).not.toBeNull();
        });
    });

    describe('el segundo factor', () => {
        it('con el factor activo la tarjeta pide el código', () => {
            const host = open({ role: 'Manager' }, enabledStatus);

            expect(cardComponent().mfaEnabled()).toBeTrue();
            expect(host.querySelector('app-change-password #changeCode')).not.toBeNull();
        });

        it('sin el factor la tarjeta no pide código', () => {
            const host = open({ role: 'Manager' }, disabledStatus);

            expect(cardComponent().mfaEnabled()).toBeFalse();
            expect(host.querySelector('app-change-password #changeCode')).toBeNull();
        });

        it('obedece el estado que cargó la pantalla, no el rol: un Owner sin factor activo no ve el código', () => {
            const host = open({ role: 'Owner' }, disabledStatus);

            expect(host.querySelector('app-change-password #changeCode')).toBeNull();
        });
    });

    describe('cuando la contraseña cambia', () => {
        it('la pantalla vuelve a pedir la lista de sesiones: las demás ya no existen', () => {
            open({ role: 'Technician' });

            cardComponent().changed.emit();

            const refresh = httpMock.match((r) => r.url === sessionsUrl && r.method === 'GET');
            expect(refresh.length).toBe(1);
            refresh[0].flush([]);
        });

        it('si la persona no puede ver sus sesiones, no se piden', () => {
            open({ role: 'Technician', permissions: ['Account.ChangePassword', 'Mfa.Manage'] });

            cardComponent().changed.emit();

            httpMock.expectNone(sessionsUrl);
        });

        it('no cierra la sesión ni navega: la persona sigue en la pantalla de seguridad', () => {
            open({ role: 'Technician' });
            const logout = spyOn(TestBed.inject(AuthService), 'logout');

            cardComponent().changed.emit();
            httpMock.match((r) => r.url === sessionsUrl).forEach((r) => r.flush([]));

            expect(logout).not.toHaveBeenCalled();
        });
    });
});
