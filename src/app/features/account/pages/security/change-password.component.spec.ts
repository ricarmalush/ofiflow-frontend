import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth';
import { ChangePasswordComponent } from './change-password.component';

const url = `${environment.apiUrl}/account/password`;
const CURRENT = 'Actual-2026-xK9!';
const NEXT = 'Nueva-2026-yL8!';

// La tarjeta «Cambiar contraseña» (spec 019): qué campos salen según el segundo factor, lo que se valida antes de enviar nada, lo que viaja y lo que NO queda en el formulario después.
describe('ChangePasswordComponent (spec 019)', () => {
    let fixture: ComponentFixture<ChangePasswordComponent>;
    let component: ChangePasswordComponent;
    let httpMock: HttpTestingController;
    let changed: jasmine.Spy;

    function open(mfaEnabled = false): HTMLElement {
        fixture = TestBed.createComponent(ChangePasswordComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('mfaEnabled', mfaEnabled);
        changed = jasmine.createSpy('changed');
        component.changed.subscribe(changed);
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    function fill(values: Partial<{ currentPassword: string; newPassword: string; repeat: string; code: string }> = {}): void {
        component.form.patchValue({ currentPassword: CURRENT, newPassword: NEXT, repeat: NEXT, ...values });
        fixture.detectChanges();
    }

    const submitButton = (host: HTMLElement) => host.querySelector('p-button button[type="submit"]') as HTMLButtonElement;
    const codeField = (host: HTMLElement) => host.querySelector('#changeCode');
    const sent = (): TestRequest => httpMock.expectOne(url);

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
        sessionStorage.clear();
    });

    describe('qué campos salen', () => {
        it('without the second factor there is no code field', () => {
            const host = open(false);

            expect(codeField(host)).toBeNull();
            expect(host.querySelector('#changeCurrent')).not.toBeNull();
            expect(host.querySelector('#changeNew')).not.toBeNull();
            expect(host.querySelector('#changeRepeat')).not.toBeNull();
        });

        it('with the second factor the code field appears, and the text says why', () => {
            const host = open(true);

            expect(codeField(host)).not.toBeNull();
            expect(host.textContent).toContain('segundo factor');
        });

        it('follows the second factor without reloading: it appears when the screen learns the account has it', () => {
            const host = open(false);
            expect(codeField(host)).toBeNull();

            fixture.componentRef.setInput('mfaEnabled', true);
            fixture.detectChanges();

            expect(codeField(host)).not.toBeNull();
        });
    });

    describe('lo que se valida antes de enviar nada', () => {
        it('the button is disabled while the form is empty', () => {
            const host = open();

            expect(submitButton(host).disabled).toBeTrue();
        });

        it('a complete and valid form enables the button', () => {
            const host = open();
            fill();

            expect(submitButton(host).disabled).toBeFalse();
        });

        it('the current password is required', () => {
            const host = open();
            fill({ currentPassword: '' });

            expect(submitButton(host).disabled).toBeTrue();
        });

        for (const length of [7, 129]) {
            it(`a new password of ${length} characters is refused without sending anything`, () => {
                const host = open();
                const text = 'x'.repeat(length);
                fill({ newPassword: text, repeat: text });

                expect(submitButton(host).disabled).toBeTrue();
                component.submit();
                httpMock.expectNone(url);
            });
        }

        for (const length of [8, 128]) {
            it(`the bounds themselves are valid (${length} characters)`, () => {
                const host = open();
                const text = 'y'.repeat(length);
                fill({ newPassword: text, repeat: text });

                expect(submitButton(host).disabled).toBeFalse();
            });
        }

        it('says it is too short once the field was touched', () => {
            const host = open();
            fill({ newPassword: 'corta', repeat: 'corta' });
            component.form.controls.newPassword.markAsTouched();
            fixture.detectChanges();

            expect(host.querySelector('[data-testid="password-too-short"]')).not.toBeNull();
        });

        it('a repetition that does not match is refused, warned, and nothing is sent', () => {
            const host = open();
            fill({ repeat: NEXT + 'x' });

            expect(host.querySelector('[data-testid="password-mismatch"]')).not.toBeNull();
            expect(submitButton(host).disabled).toBeTrue();
            component.submit();
            httpMock.expectNone(url);
        });

        it('a matching repetition shows no warning', () => {
            const host = open();
            fill();

            expect(host.querySelector('[data-testid="password-mismatch"]')).toBeNull();
        });

        it('with the second factor the code is required', () => {
            const host = open(true);
            fill({ code: '' });

            expect(submitButton(host).disabled).toBeTrue();
            fill({ code: '123456' });
            expect(submitButton(host).disabled).toBeFalse();
        });

        it('without the second factor the code is not required', () => {
            const host = open(false);
            fill({ code: '' });

            expect(submitButton(host).disabled).toBeFalse();
        });

        it('a code longer than 64 characters is refused', () => {
            const host = open(true);
            fill({ code: '1'.repeat(65) });

            expect(submitButton(host).disabled).toBeTrue();
        });
    });

    describe('lo que se envía', () => {
        it('the current and the new password, without the repetition and without a code, when there is no second factor', () => {
            open(false);
            fill();

            component.submit();

            const req = sent();
            expect(req.request.method).toBe('PUT');
            expect(req.request.body).toEqual({ currentPassword: CURRENT, newPassword: NEXT });
            req.flush(null, { status: 204, statusText: 'No Content' });
        });

        it('with the second factor it also sends the code, trimmed', () => {
            open(true);
            fill({ code: '  123456  ' });

            component.submit();

            const req = sent();
            expect(req.request.body).toEqual({ currentPassword: CURRENT, newPassword: NEXT, code: '123456' });
            req.flush(null, { status: 204, statusText: 'No Content' });
        });

        it('without the second factor a leftover code is NOT sent', () => {
            open(false);
            fill({ code: '999999' });

            component.submit();

            const req = sent();
            expect('code' in req.request.body).toBeFalse();
            req.flush(null, { status: 204, statusText: 'No Content' });
        });

        it('a second submit while the first is in flight sends nothing more', () => {
            const host = open();
            fill();

            component.submit();
            component.submit();

            const req = sent(); // expectOne falla si hubiera dos
            expect(component.busy()).toBeTrue();
            req.flush(null, { status: 204, statusText: 'No Content' });
            expect(component.busy()).toBeFalse();
            expect(host).toBeTruthy();
        });

        it('really works from the screen: typing in the three fields and pressing the button sends the request (the fields are bound to their controls)', () => {
            const host = open();
            const type = (selector: string, value: string) => {
                const input = host.querySelector(selector) as HTMLInputElement;
                input.value = value;
                input.dispatchEvent(new Event('input'));
            };

            type('#changeCurrent', CURRENT);
            type('#changeNew', NEXT);
            type('#changeRepeat', NEXT);
            fixture.detectChanges();
            submitButton(host).click();

            const req = sent();
            expect(req.request.body).toEqual({ currentPassword: CURRENT, newPassword: NEXT });
            req.flush(null, { status: 204, statusText: 'No Content' });
        });
    });

    describe('si sale bien', () => {
        it('tells the person, clears every field, and asks the screen to refresh the sessions', () => {
            open(true);
            fill({ code: '123456' });

            component.submit();
            sent().flush(null, { status: 204, statusText: 'No Content' });
            fixture.detectChanges();

            expect(component.success()).toBeTrue();
            expect(component.error()).toBeNull();
            expect(component.form.getRawValue()).toEqual({ currentPassword: '', newPassword: '', repeat: '', code: '' });
            expect(changed).toHaveBeenCalledTimes(1);
        });

        it('leaves no password in the page: every input is empty afterwards', () => {
            const host = open(true);
            fill({ code: '123456' });

            component.submit();
            sent().flush(null, { status: 204, statusText: 'No Content' });
            fixture.detectChanges();

            const values = Array.from(host.querySelectorAll('input')).map((input) => (input as HTMLInputElement).value);
            expect(values.length).toBeGreaterThanOrEqual(4);
            expect(values.every((value) => value === '')).toBeTrue();
            expect(host.textContent).not.toContain(CURRENT);
            expect(host.textContent).not.toContain(NEXT);
        });

        it('shows the success message', () => {
            const host = open();
            fill();

            component.submit();
            sent().flush(null, { status: 204, statusText: 'No Content' });
            fixture.detectChanges();

            expect(host.querySelector('[data-testid="password-changed"]')?.textContent).toContain('Contraseña cambiada');
        });

        it('does NOT close the session: the API keeps this one and the person stays inside', () => {
            open();
            const logout = spyOn(TestBed.inject(AuthService), 'logout');
            fill();

            component.submit();
            sent().flush(null, { status: 204, statusText: 'No Content' });

            expect(logout).not.toHaveBeenCalled();
        });
    });

    describe('si sale mal', () => {
        const problem = (code: string, detail: string, status = 400) => ({ type: 'about:blank', title: 'Error', status, code, detail });

        it('shows the text of the API and does not announce a change', () => {
            const host = open();
            fill();

            component.submit();
            sent().flush(problem('password.current_invalid', 'La contraseña actual no es correcta.'), { status: 400, statusText: 'Bad Request' });
            fixture.detectChanges();

            expect(host.querySelector('[data-testid="password-error"]')?.textContent).toContain('La contraseña actual no es correcta.');
            expect(host.querySelector('[data-testid="password-changed"]')).toBeNull();
            expect(changed).not.toHaveBeenCalled();
        });

        it('clears the current password and the code (single use) but keeps what is new, so it is not typed again', () => {
            open(true);
            fill({ code: '123456' });

            component.submit();
            sent().flush(problem('mfa.invalid_code', 'El código no es válido.'), { status: 400, statusText: 'Bad Request' });

            const values = component.form.getRawValue();
            expect(values.currentPassword).toBe('');
            expect(values.code).toBe('');
            expect(values.newPassword).toBe(NEXT);
            expect(values.repeat).toBe(NEXT);
        });

        it('the same-password error is shown too', () => {
            const host = open();
            fill({ newPassword: CURRENT, repeat: CURRENT });

            component.submit();
            sent().flush(problem('password.unchanged', 'La contraseña nueva debe ser distinta de la actual.'), { status: 400, statusText: 'Bad Request' });
            fixture.detectChanges();

            expect(host.querySelector('[data-testid="password-error"]')?.textContent).toContain('distinta de la actual');
        });

        it('a 429 shows its text, and the button works again afterwards', () => {
            open();
            fill();

            component.submit();
            sent().flush(problem('rate_limit.exceeded', 'Demasiadas peticiones.', 429), { status: 429, statusText: 'Too Many Requests' });

            expect(component.error()).toContain('Demasiadas peticiones');
            expect(component.busy()).toBeFalse();
        });

        it('a network failure shows a message and does not leave the card stuck', () => {
            open();
            fill();

            component.submit();
            sent().error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

            expect(component.error()).toBeTruthy();
            expect(component.busy()).toBeFalse();
        });

        it('a new attempt clears the previous error and the previous success', () => {
            open();
            fill();
            component.submit();
            sent().flush(problem('password.current_invalid', 'La contraseña actual no es correcta.'), { status: 400, statusText: 'Bad Request' });
            expect(component.error()).not.toBeNull();

            fill({ currentPassword: CURRENT });
            component.submit();

            expect(component.error()).toBeNull();
            expect(component.success()).toBeFalse();
            sent().flush(null, { status: 204, statusText: 'No Content' });
        });
    });
});
