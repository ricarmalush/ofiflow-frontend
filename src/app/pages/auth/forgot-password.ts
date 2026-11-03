import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../core/services/auth';
import { AppFloatingConfigurator } from '../../layout/component/app.floatingconfigurator';

// Lo que se le dice a la persona cuando la API respondió 202. Es el MISMO texto exista la cuenta o no (spec 018 R1): la API no revela si el email está registrado y esta
// pantalla tampoco puede hacerlo con su redacción. Por eso no dice «te hemos enviado un correo», que no sabemos, sino «si existe una cuenta...».
export const FORGOT_PASSWORD_SENT_MESSAGE = 'Si existe una cuenta con ese email, te enviaremos un enlace para elegir una contraseña nueva. Caduca en una hora y solo sirve una vez. Revisa también la carpeta de spam.';

// Página pública a la que lleva «¿Has olvidado tu contraseña?» (spec 018). Pide el email y nada más.
@Component({
    selector: 'app-forgot-password',
    standalone: true,
    imports: [FormsModule, RouterModule, ButtonModule, InputTextModule, MessageModule, AppFloatingConfigurator],
    template: `
        <app-floating-configurator />
        <div class="bg-surface-50 dark:bg-surface-950 flex items-center justify-center min-h-screen min-w-screen overflow-hidden">
            <div class="w-full max-w-xl px-4">
                <div class="bg-surface-0 dark:bg-surface-900 py-12 px-8 sm:px-12 rounded-3xl">
                    <div class="text-surface-900 dark:text-surface-0 text-3xl font-medium mb-2 text-center">Recupera tu contraseña</div>
                    <div class="text-muted-color text-center mb-8">Escribe el email de tu cuenta y te enviaremos un enlace para elegir una nueva.</div>

                    @if (sent()) {
                        <p-message severity="success" styleClass="mb-6">{{ sentMessage }}</p-message>
                    } @else {
                        @if (error()) {
                            <p-message severity="error" styleClass="mb-6">{{ error() }}</p-message>
                        }
                        <form (ngSubmit)="submit()" class="flex flex-col gap-5">
                            <div class="flex flex-col gap-2">
                                <label for="email" class="font-medium">Email</label>
                                <input pInputText id="email" name="email" type="email" autocomplete="username" placeholder="tu@empresa.com" [(ngModel)]="email" required />
                            </div>
                            <p-button type="submit" label="Enviar el enlace" styleClass="w-full" [loading]="loading()" [disabled]="!email.trim()" />
                        </form>
                    }

                    <div class="text-center mt-8">
                        <a routerLink="/auth/login" class="text-primary font-medium">Volver a iniciar sesión</a>
                    </div>
                </div>
            </div>
        </div>
    `
})
export class ForgotPassword {
    private authService = inject(AuthService);

    readonly sentMessage = FORGOT_PASSWORD_SENT_MESSAGE;

    email = '';

    readonly loading = signal(false);
    readonly sent = signal(false);
    readonly error = signal<string | null>(null);

    submit(): void {
        const email = this.email.trim();
        if (!email || this.loading()) {
            return;
        }
        this.loading.set(true);
        this.error.set(null);

        this.authService.forgotPassword(email).subscribe((result) => {
            this.loading.set(false);
            if (result.isSuccess) {
                // El mismo mensaje para cualquier 202. El email no se guarda: no hace falta en la pantalla siguiente.
                this.email = '';
                this.sent.set(true);
                return;
            }
            // Solo llegan fallos que no dependen de la cuenta: email mal formado (400), límite de la IP (429) o sin red.
            this.error.set(result.message);
        });
    }
}
