import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../core/services/auth';
import { clearFragment, readFragmentToken } from '../../core/utils/fragment-token.util';
import { AppFloatingConfigurator } from '../../layout/component/app.floatingconfigurator';

// Límites de la API (ResetPasswordCommandValidator: PasswordRules, los mismos que el registro).
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

// El código estable con el que la API rechaza un token desconocido, caducado, usado o anulado (los cuatro dan el mismo; spec 018 R8).
export const PASSWORD_RESET_INVALID_CODE = 'password_reset.invalid';

export const PASSWORD_RESET_DONE_MESSAGE = 'Contraseña cambiada. Se han cerrado todas tus sesiones: entra con la nueva.';

// Sin token en la dirección (abrió la página a mano, o el enlace llegó cortado).
export const PASSWORD_RESET_NO_TOKEN_MESSAGE = 'El enlace no es válido. Pide uno nuevo.';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
    return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

// Página pública a la que lleva el enlace del correo de «he olvidado mi contraseña» (spec 018). El token viaja en el fragmento ("#token=..."): se lee al entrar y se borra
// de la barra de direcciones y del historial. La persona elige su contraseña nueva; la API no abre sesión, así que después entra por el login normal.
@Component({
    selector: 'app-reset-password',
    standalone: true,
    imports: [ReactiveFormsModule, RouterModule, ButtonModule, MessageModule, PasswordModule, AppFloatingConfigurator],
    template: `
        <app-floating-configurator />
        <div class="bg-surface-50 dark:bg-surface-950 flex items-center justify-center min-h-screen min-w-screen overflow-hidden">
            <div class="w-full max-w-xl px-4">
                <div class="bg-surface-0 dark:bg-surface-900 py-12 px-8 sm:px-12 rounded-3xl">
                    <div class="text-surface-900 dark:text-surface-0 text-3xl font-medium mb-2 text-center">Elige una contraseña nueva</div>
                    <div class="text-muted-color text-center mb-8">Al cambiarla se cerrarán todas tus sesiones abiertas.</div>

                    @if (!token || rejected()) {
                        <p-message severity="error" styleClass="mb-6">{{ rejected() ? error() : noTokenMessage }}</p-message>
                        <div class="text-center">
                            <a routerLink="/auth/forgot-password" class="text-primary font-medium">Pedir un enlace nuevo</a>
                        </div>
                    } @else {
                        @if (error()) {
                            <p-message severity="error" styleClass="mb-6">{{ error() }}</p-message>
                        }
                        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-5">
                            <div class="flex flex-col gap-2">
                                <label for="password" class="font-medium">Contraseña nueva</label>
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
                            <p-button type="submit" label="Cambiar la contraseña" styleClass="w-full" [loading]="saving()" [disabled]="form.invalid" />
                        </form>
                    }
                </div>
            </div>
        </div>
    `
})
export class ResetPassword implements OnInit {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private router = inject(Router);

    readonly passwordMin = PASSWORD_MIN_LENGTH;
    readonly passwordMax = PASSWORD_MAX_LENGTH;
    readonly noTokenMessage = PASSWORD_RESET_NO_TOKEN_MESSAGE;

    readonly saving = signal(false);
    readonly error = signal<string | null>(null);
    // true cuando la API dijo que el enlace no sirve (caducado, usado, anulado...): se esconde el formulario, porque reintentar con el mismo token no puede funcionar.
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

        this.authService.resetPassword(this.token, this.form.getRawValue().password).subscribe((result) => {
            this.saving.set(false);
            if (result.isSuccess) {
                // El token ya no sirve (se consumió) y la contraseña no se queda en la pantalla.
                this.token = null;
                this.form.reset();
                this.router.navigate(['/auth/login'], { state: { info: PASSWORD_RESET_DONE_MESSAGE } });
                return;
            }
            this.error.set(result.message);
            // Un token mal formado se rechaza en la validación (400 con el error en el campo) y uno que no sirve, en el caso de uso (400 con el código arriba): en los dos
            // casos el enlace no tiene arreglo y hay que pedir otro.
            if (result.code === PASSWORD_RESET_INVALID_CODE || result.fieldErrors?.some((e) => e.code === PASSWORD_RESET_INVALID_CODE)) {
                this.rejected.set(true);
            }
        });
    }
}
