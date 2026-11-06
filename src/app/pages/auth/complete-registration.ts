import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { REGISTRATION_INVALID_CODE } from '../../core/constants/legal';
import { AuthService } from '../../core/services/auth';
import { clearFragment, readFragmentToken } from '../../core/utils/fragment-token.util';
import { AppFloatingConfigurator } from '../../layout/component/app.floatingconfigurator';

// Límites de la API (CompleteRegistrationCommandValidator: PasswordRules, los mismos de siempre).
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

export const REGISTRATION_DONE_MESSAGE = 'Cuenta creada. Ya puedes entrar con tu email y la contraseña que acabas de elegir.';

// Sin token en la dirección (abrió la página a mano, o el enlace llegó cortado).
export const REGISTRATION_NO_TOKEN_MESSAGE = 'El enlace no es válido. Pide uno nuevo.';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
    return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

// Página pública a la que lleva el enlace del correo de «crear una cuenta» (spec 021): {Email:LinkBaseUrl}/auth/complete-registration#token=... El token viaja en el fragmento: se lee
// al entrar y se borra de la barra de direcciones y del historial. La persona elige su contraseña (D5) y AQUÍ nace su cuenta; la API no abre sesión (D6), así que después entra por el
// login normal.
@Component({
    selector: 'app-complete-registration',
    standalone: true,
    imports: [ReactiveFormsModule, RouterModule, ButtonModule, MessageModule, PasswordModule, AppFloatingConfigurator],
    template: `
        <app-floating-configurator />
        <div class="bg-surface-50 dark:bg-surface-950 flex items-center justify-center min-h-screen min-w-screen overflow-hidden">
            <div class="w-full max-w-xl px-4">
                <div class="bg-surface-0 dark:bg-surface-900 py-12 px-8 sm:px-12 rounded-3xl">
                    <div class="text-surface-900 dark:text-surface-0 text-3xl font-medium mb-2 text-center">Elige tu contraseña</div>
                    <div class="text-muted-color text-center mb-8">Con ella entrarás en tu cuenta de OfiFlow. Nadie más la conoce.</div>

                    @if (!token || rejected()) {
                        <p-message severity="error" styleClass="mb-6" data-testid="complete-error">{{ rejected() ? error() : noTokenMessage }}</p-message>
                        <div class="text-center">
                            <a routerLink="/auth/register" class="text-primary font-medium" data-testid="register-again-link">Pedir un enlace nuevo</a>
                        </div>
                    } @else {
                        @if (error()) {
                            <p-message severity="error" styleClass="mb-6" data-testid="complete-error">{{ error() }}</p-message>
                        }
                        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-5">
                            <div class="flex flex-col gap-2">
                                <label for="password" class="font-medium">Contraseña</label>
                                <p-password inputId="password" formControlName="password" autocomplete="new-password" [toggleMask]="true" [feedback]="false" [fluid]="true" />
                                <small class="text-muted-color">Entre {{ passwordMin }} y {{ passwordMax }} caracteres.</small>
                            </div>
                            <div class="flex flex-col gap-2">
                                <label for="confirm" class="font-medium">Repite la contraseña</label>
                                <p-password inputId="confirm" formControlName="confirm" autocomplete="new-password" [toggleMask]="true" [feedback]="false" [fluid]="true" />
                                @if (form.errors?.['mismatch'] && form.controls.confirm.touched) {
                                    <small class="text-red-500">Las contraseñas no coinciden.</small>
                                }
                            </div>
                            <p-button type="submit" label="Crear mi cuenta" styleClass="w-full" [loading]="saving()" [disabled]="form.invalid" />
                        </form>
                    }
                </div>
            </div>
        </div>
    `
})
export class CompleteRegistration implements OnInit {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private router = inject(Router);

    readonly passwordMin = PASSWORD_MIN_LENGTH;
    readonly passwordMax = PASSWORD_MAX_LENGTH;
    readonly noTokenMessage = REGISTRATION_NO_TOKEN_MESSAGE;

    readonly saving = signal(false);
    readonly error = signal<string | null>(null);
    // true cuando la API dijo que el enlace no sirve (caducado, usado, sustituido, el email ya tiene cuenta...): se esconde el formulario, porque reintentar con el mismo token no puede funcionar.
    readonly rejected = signal(false);
    token: string | null = null;

    readonly form = this.fb.nonNullable.group(
        {
            password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), Validators.maxLength(PASSWORD_MAX_LENGTH)]],
            confirm: ['', [Validators.required]]
        },
        { validators: passwordsMatch }
    );

    ngOnInit(): void {
        this.token = readFragmentToken(location.hash);
        // Se quita el token de la barra de direcciones y del historial: si alguien mira la pantalla o el historial del navegador después, ya no lo ve.
        clearFragment();
    }

    submit(): void {
        if (!this.token || this.form.invalid || this.saving()) {
            return;
        }
        this.saving.set(true);
        this.error.set(null);

        this.authService.completeRegistration(this.token, this.form.getRawValue().password).subscribe((result) => {
            this.saving.set(false);
            if (result.isSuccess) {
                // El token ya no sirve (se consumió) y la contraseña no se queda en la pantalla.
                this.token = null;
                this.form.reset();
                this.router.navigate(['/auth/login'], { state: { info: REGISTRATION_DONE_MESSAGE } });
                return;
            }
            // Un token mal formado se rechaza en la validación (400 con el error en el campo) y uno que no sirve, en el caso de uso (400 con el código arriba): en los dos
            // casos el enlace no tiene arreglo y hay que pedir otro. Un fallo que se puede reintentar (contraseña no válida, límite de la IP, sin red) conserva el formulario y el token.
            const tokenError = result.fieldErrors?.find((e) => e.code === REGISTRATION_INVALID_CODE);
            if (result.code === REGISTRATION_INVALID_CODE || tokenError) {
                this.rejected.set(true);
            }
            // En el caso del token mal formado el texto útil está en el campo, no en el general («Hay datos no válidos»).
            this.error.set(tokenError?.message ?? result.message);
        });
    }
}
