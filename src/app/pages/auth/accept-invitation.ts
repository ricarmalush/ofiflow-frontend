import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../core/services/auth';
import { AppFloatingConfigurator } from '../../layout/component/app.floatingconfigurator';

// Límites de la API (AcceptInvitationCommandValidator: User.NameMaxLength y PasswordRules).
const NAME_MAX_LENGTH = 200;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
    return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

// Lee el token del fragmento: "#token=...". Devuelve null si no hay.
export function readInvitationToken(hash: string): string | null {
    const value = new URLSearchParams(hash.replace(/^#/, '')).get('token');
    return value ? value : null;
}

// Página pública a la que lleva el enlace de invitación. La persona elige su nombre y su
// contraseña; nadie más la conoce, ni quien la invitó (spec 009, NEVER).
@Component({
    selector: 'app-accept-invitation',
    standalone: true,
    imports: [ReactiveFormsModule, RouterModule, ButtonModule, InputTextModule, PasswordModule, MessageModule, AppFloatingConfigurator],
    template: `
        <app-floating-configurator />
        <div class="bg-surface-50 dark:bg-surface-950 flex items-center justify-center min-h-screen min-w-screen overflow-hidden">
            <div class="w-full max-w-xl px-4">
                <div class="bg-surface-0 dark:bg-surface-900 py-12 px-8 sm:px-12 rounded-3xl">
                    <div class="text-surface-900 dark:text-surface-0 text-3xl font-medium mb-2 text-center">Únete a tu equipo en OfiFlow</div>
                    <div class="text-muted-color text-center mb-8">Elige tu nombre y tu contraseña para crear la cuenta.</div>

                    @if (!token) {
                        <p-message severity="error" styleClass="mb-6">El enlace no es válido. Pide a quien te invitó que te envíe uno nuevo.</p-message>
                    } @else {
                        @if (error()) {
                            <p-message severity="error" styleClass="mb-6">{{ error() }}</p-message>
                        }
                        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-5">
                            <div class="flex flex-col gap-2">
                                <label for="name" class="font-medium">Nombre</label>
                                <input pInputText id="name" formControlName="name" autocomplete="name" [maxlength]="nameMax" />
                            </div>
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
export class AcceptInvitation implements OnInit {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private router = inject(Router);

    readonly nameMax = NAME_MAX_LENGTH;
    readonly passwordMin = PASSWORD_MIN_LENGTH;
    readonly passwordMax = PASSWORD_MAX_LENGTH;

    readonly saving = signal(false);
    readonly error = signal<string | null>(null);
    token: string | null = null;

    readonly form = this.fb.nonNullable.group(
        {
            name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
            password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), Validators.maxLength(PASSWORD_MAX_LENGTH)]],
            confirm: ['', [Validators.required]]
        },
        { validators: passwordsMatch }
    );

    ngOnInit(): void {
        this.token = readInvitationToken(location.hash);
        // Se quita el token de la barra de direcciones y del historial: si alguien mira la
        // pantalla o el historial del navegador después, ya no lo ve.
        if (location.hash) {
            history.replaceState(history.state, '', location.pathname);
        }
    }

    submit(): void {
        if (!this.token || this.form.invalid || this.saving()) {
            return;
        }
        const { name, password } = this.form.getRawValue();
        this.saving.set(true);
        this.error.set(null);
        this.authService.acceptInvitation(this.token, name.trim(), password).subscribe((result) => {
            this.saving.set(false);
            if (!result.isSuccess) {
                this.error.set(result.message);
                return;
            }
            this.token = null;
            this.router.navigate(['/auth/login'], { state: { info: 'Cuenta creada. Ya puedes entrar con tu email y tu contraseña.' } });
        });
    }
}
