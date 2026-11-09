import { Component, effect, inject, input, output, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { PasswordService } from '../../services/password.service';

// Las mismas reglas que al elegir una contraseña en el registro y en el restablecimiento: de 8 a 128, sin más exigencias (NIST SP 800-63B).
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
// El mismo tope que el segundo factor para el código (de la app o de recuperación).
const CODE_MAX_LENGTH = 64;

// La repetición solo existe en el cliente: la API recibe una única contraseña nueva.
function repeatMatches(group: AbstractControl): ValidationErrors | null {
    return group.get('newPassword')?.value === group.get('repeat')?.value ? null : { mismatch: true };
}

// Tarjeta «Cambiar contraseña» de la pantalla de seguridad (spec 019). Quien decide si se muestra es la pantalla (el permiso y que no deba activar el segundo factor): aquí solo se
// recoge el formulario. Tras un cambio correcto NO se cierra la sesión (la API conserva esta y cierra las demás): se limpia el formulario, se avisa y se le dice a la pantalla que refresque las sesiones.
@Component({
    selector: 'app-change-password',
    standalone: true,
    imports: [ReactiveFormsModule, ButtonModule, InputTextModule, PasswordModule, MessageModule],
    templateUrl: './change-password.component.html'
})
export class ChangePasswordComponent {
    private fb = inject(FormBuilder);
    private passwordService = inject(PasswordService);

    // Si la cuenta tiene el segundo factor activo: entonces se pide también un código. Lo dice la pantalla (ya cargó el estado del factor); la API es quien lo exige de verdad.
    readonly mfaEnabled = input(false);

    // Se avisa tras cambiarla bien, para que la pantalla refresque la lista de sesiones (las demás ya no existen).
    readonly changed = output<void>();

    readonly busy = signal(false);
    readonly error = signal<string | null>(null);
    readonly success = signal(false);

    readonly passwordMin = PASSWORD_MIN_LENGTH;
    readonly passwordMax = PASSWORD_MAX_LENGTH;

    readonly form = this.fb.nonNullable.group(
        {
            currentPassword: ['', [Validators.required, Validators.maxLength(PASSWORD_MAX_LENGTH)]],
            newPassword: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), Validators.maxLength(PASSWORD_MAX_LENGTH)]],
            repeat: ['', Validators.required],
            code: ['', Validators.maxLength(CODE_MAX_LENGTH)]
        },
        { validators: repeatMatches }
    );

    constructor() {
        // El código solo es obligatorio con el segundo factor activo; sin él, el campo ni se ve.
        effect(() => {
            const code = this.form.controls.code;
            code.setValidators(this.mfaEnabled() ? [Validators.required, Validators.maxLength(CODE_MAX_LENGTH)] : [Validators.maxLength(CODE_MAX_LENGTH)]);
            code.updateValueAndValidity();
        });
    }

    submit(): void {
        if (this.form.invalid || this.busy()) return;

        const { currentPassword, newPassword, code } = this.form.getRawValue();
        this.busy.set(true);
        this.error.set(null);
        this.success.set(false);

        this.passwordService.change(currentPassword, newPassword, this.mfaEnabled() ? code.trim() : undefined).subscribe((result) => {
            this.busy.set(false);

            if (result.isSuccess) {
                // Ninguna contraseña ni código se queda en el formulario ni en memoria.
                this.form.reset();
                this.success.set(true);
                this.changed.emit();
                return;
            }

            // La actual y el código se borran (la actual por seguridad y el código porque es de un solo uso); lo nuevo se conserva para no teclearlo otra vez.
            this.form.patchValue({ currentPassword: '', code: '' });
            this.error.set(result.message);
        });
    }
}
