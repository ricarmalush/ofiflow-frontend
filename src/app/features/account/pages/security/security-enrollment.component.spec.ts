import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { SecurityComponent } from './security.component';

const mfaUrl = `${environment.apiUrl}/account/mfa`;
const sessionsUrl = `${environment.apiUrl}/account/sessions`;

// La pantalla de seguridad cuando el segundo factor es obligatorio (spec 022): el aviso fijo, llegar directo al asistente, no ofrecer «Desactivar» a quien tiene un rol que lo exige
// (lo dice la API en «quién soy», no una lista de roles copiada aquí) y no pedir las sesiones a quien la API se las negaría.
describe('SecurityComponent · segundo factor obligatorio (spec 022)', () => {
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

    const banner = (host: HTMLElement) => host.querySelector('[data-testid="enrollment-banner"]');
    const buttonLabelled = (host: HTMLElement, text: string) => Array.from(host.querySelectorAll('p-button')).find((b) => b.textContent?.includes(text)) ?? null;

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), MessageService, ConfirmationService] });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

    describe('whoever must enrol the factor and has not', () => {
        const mustEnroll = { role: 'Owner', secondFactorEnrollmentRequired: true, secondFactorRequired: true } as const;

        it('sees the fixed notice that says why', () => {
            const host = open(mustEnroll);

            expect(banner(host)).not.toBeNull();
            expect(banner(host)?.textContent).toContain('Tu rol exige el segundo factor');
        });

        it('lands DIRECTLY on the first step of the wizard (asking for the password), not on the status with a button', () => {
            const host = open(mustEnroll);

            expect(fixture.componentInstance.view()).toBe('setup-password');
            expect(host.textContent).toContain('Confirma tu contraseña para empezar');
        });

        it('the wizard works for them: the password goes to /setup (allowed without the factor) and the next step shows the secret', () => {
            const host = open(mustEnroll);
            fixture.componentInstance.passwordForm.setValue({ password: 'Clave-Elegida-xK9-2026!' });

            fixture.componentInstance.startSetup();
            const req = httpMock.expectOne(`${mfaUrl}/setup`);
            expect(req.request.method).toBe('POST');
            req.flush({ secret: 'JBSWY3DPEHPK3PXP', otpAuthUri: 'otpauth://totp/OfiFlow:ana@empresa.com?secret=JBSWY3DPEHPK3PXP&issuer=OfiFlow' });
            fixture.detectChanges();

            expect(fixture.componentInstance.view()).toBe('setup-scan');
            expect(host.textContent).toContain('JBSWY3DPEHPK3PXP');
        });

        it('keeps the notice while they go through the steps and comes back to the status with the "Activar" button', () => {
            const host = open(mustEnroll);

            fixture.componentInstance.cancel();
            fixture.detectChanges();

            expect(banner(host)).not.toBeNull();
            expect(buttonLabelled(host, 'Activar')).not.toBeNull();
        });

        it('is not offered the sessions card, and the list is NOT requested (the API would answer 403 and add noise)', () => {
            const host = open(mustEnroll);

            expect(host.textContent).not.toContain('Sesiones');
            expect(buttonLabelled(host, 'Cerrar todas mis sesiones')).toBeNull();
            httpMock.expectNone(sessionsUrl);
        });

        it('the notice disappears on its own once the account says the factor is enrolled', () => {
            const host = open(mustEnroll);

            session.setAccount(buildAccount({ role: 'Owner', secondFactorEnrollmentRequired: false, secondFactorRequired: true }));
            fixture.detectChanges();
            httpMock.match((r) => r.url === sessionsUrl).forEach((r) => r.flush([]));

            expect(banner(host)).toBeNull();
        });

        it('obeys what the API said, not the role name: a Technician told to enrol sees the notice too', () => {
            const host = open({ role: 'Technician', secondFactorEnrollmentRequired: true });

            expect(banner(host)).not.toBeNull();
        });
    });

    describe('whoever does not have to enrol it', () => {
        it('sees no notice, lands on the status and has the sessions card', () => {
            const host = open({ role: 'Technician' });

            expect(banner(host)).toBeNull();
            expect(fixture.componentInstance.view()).toBe('status');
            expect(host.textContent).toContain('Sesiones');
        });

        it('obeys what the API said, not the role name: an Owner the API says need not enrol sees no notice', () => {
            const host = open({ role: 'Owner', secondFactorEnrollmentRequired: false, secondFactorRequired: true }, enabledStatus);

            expect(banner(host)).toBeNull();
        });
    });

    describe('«Desactivar»', () => {
        it('is offered to a role that does not require the factor', () => {
            const host = open({ role: 'Manager', secondFactorRequired: false }, enabledStatus);

            expect(buttonLabelled(host, 'Desactivar')).not.toBeNull();
            expect(host.querySelector('[data-testid="cannot-disable"]')).toBeNull();
        });

        it('is NOT offered to a role that requires it (the API says so), and the screen says why', () => {
            const host = open({ role: 'Owner', secondFactorRequired: true }, enabledStatus);

            expect(buttonLabelled(host, 'Desactivar')).toBeNull();
            expect(host.querySelector('[data-testid="cannot-disable"]')?.textContent).toContain('no se puede desactivar');
        });

        it('the other buttons of the status are still there for that role (regenerating the codes stays possible)', () => {
            const host = open({ role: 'Owner', secondFactorRequired: true }, enabledStatus);

            expect(buttonLabelled(host, 'Generar códigos nuevos')).not.toBeNull();
        });

        it('obeys what the API said, not the role name: a Technician the API says requires it has no button either', () => {
            const host = open({ role: 'Technician', secondFactorRequired: true }, enabledStatus);

            expect(buttonLabelled(host, 'Desactivar')).toBeNull();
        });

        it('follows the account without reloading: a demotion gives the button back', () => {
            const host = open({ role: 'Admin', secondFactorRequired: true }, enabledStatus);
            expect(buttonLabelled(host, 'Desactivar')).toBeNull();

            session.setAccount(buildAccount({ role: 'Manager', secondFactorRequired: false }));
            fixture.detectChanges();
            httpMock.match((r) => r.url === sessionsUrl).forEach((r) => r.flush([]));
            fixture.detectChanges();

            expect(buttonLabelled(host, 'Desactivar')).not.toBeNull();
        });

        it('the "disable" step cannot be opened by code either when the role requires the factor', () => {
            open({ role: 'Owner', secondFactorRequired: true }, enabledStatus);

            fixture.componentInstance.go('disable');

            expect(fixture.componentInstance.view()).toBe('status');
        });

        it('and disable() sends nothing even with the form filled in', () => {
            open({ role: 'Owner', secondFactorRequired: true }, enabledStatus);
            fixture.componentInstance.passwordAndCodeForm.setValue({ password: 'Clave-Elegida-xK9-2026!', code: '123456' });

            fixture.componentInstance.disable();

            httpMock.expectNone(`${mfaUrl}/disable`);
        });

        it('for a role that does not require it, disable() does send the request', () => {
            open({ role: 'Manager', secondFactorRequired: false }, enabledStatus);
            const logout = spyOn(TestBed.inject(AuthService), 'logout'); // desactivar con éxito cierra la sesión (la API cerró todas)
            fixture.componentInstance.passwordAndCodeForm.setValue({ password: 'Clave-Elegida-xK9-2026!', code: '123456' });

            fixture.componentInstance.disable();

            httpMock.expectOne(`${mfaUrl}/disable`).flush(null, { status: 204, statusText: 'No Content' });
            expect(logout).toHaveBeenCalled();
        });
    });
});
