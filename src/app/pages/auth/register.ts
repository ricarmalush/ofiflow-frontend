import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TERMS_VERSION } from '../../core/constants/legal';
import { AuthService } from '../../core/services/auth';
import { FieldError } from '../../shared/models/problem-details.model';
import { TermsCheckbox } from '../../shared/components/terms-checkbox';
import { AppFloatingConfigurator } from '../../layout/component/app.floatingconfigurator';

// Límites de la API (RequestRegistrationCommandValidator: Tenant.NameMaxLength, User.NameMaxLength y Email.MaxLength).
const COMPANY_NAME_MAX_LENGTH = 200;
const USER_NAME_MAX_LENGTH = 200;
const EMAIL_MAX_LENGTH = 320;

// Lo que se le dice a la persona cuando la API respondió 202. Es el MISMO texto sea el email nuevo o ya tenga cuenta, esté el límite del email superado o el correo apagado (spec 021 R1):
// la API no revela nada y esta pantalla tampoco puede hacerlo con su redacción. Por eso NO afirma que se haya enviado nada («te hemos enviado»), que no sabemos, sino «recibirás...».
export const REGISTRATION_REQUESTED_MESSAGE =
    'Si el email es válido, recibirás un correo con un enlace para completar el registro. Caduca en 24 horas y solo sirve una vez. Revisa también la carpeta de spam. Hasta que abras ese enlace no se crea ninguna cuenta.';

// Un campo con solo espacios no cuenta como escrito (la API lo recortaría y lo rechazaría).
function notBlank(control: AbstractControl): ValidationErrors | null {
    return typeof control.value === 'string' && control.value.trim() === '' ? { blank: true } : null;
}

// El validador de email de Angular no recorta: «ana@empresa.com » (con el espacio que deja pegar o autocompletar) sería inválido y el botón quedaría bloqueado, aunque al enviar sí
// se recorta. Se valida el valor ya recortado, que es el que viaja.
function trimmedEmail(control: AbstractControl): ValidationErrors | null {
    return Validators.email({ value: typeof control.value === 'string' ? control.value.trim() : control.value } as AbstractControl);
}

// Página pública a la que lleva «¿No tienes cuenta? Crea una» (spec 021). Pide la empresa, el nombre, el email y la aceptación de las condiciones. NO pide contraseña: se elige al abrir
// el enlace del correo (D5), y no existe ninguna cuenta hasta entonces (D1). Tras pedir, siempre el mismo mensaje.
@Component({
    selector: 'app-register',
    standalone: true,
    imports: [ReactiveFormsModule, RouterModule, ButtonModule, InputTextModule, MessageModule, TermsCheckbox, AppFloatingConfigurator],
    template: `
        <app-floating-configurator />
        <div class="bg-surface-50 dark:bg-surface-950 flex items-center justify-center min-h-screen min-w-screen overflow-hidden">
            <div class="w-full max-w-xl px-4 py-8">
                <div class="bg-surface-0 dark:bg-surface-900 py-12 px-8 sm:px-12 rounded-3xl">
                    <div class="text-surface-900 dark:text-surface-0 text-3xl font-medium mb-2 text-center">Crea tu cuenta de OfiFlow</div>
                    <div class="text-muted-color text-center mb-8">Cuéntanos quién eres y te enviaremos un enlace para elegir tu contraseña y terminar.</div>

                    @if (requested()) {
                        <p-message severity="success" styleClass="mb-6" data-testid="requested-message">{{ requestedMessage }}</p-message>
                    } @else {
                        @if (error()) {
                            <p-message severity="error" styleClass="mb-6" data-testid="register-error">{{ error() }}</p-message>
                        }
                        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-5">
                            <div class="flex flex-col gap-2">
                                <label for="companyName" class="font-medium">Nombre de la empresa</label>
                                <input pInputText id="companyName" formControlName="companyName" autocomplete="organization" [maxlength]="companyNameMax" />
                                @if (form.controls.companyName.errors?.['api']) {
                                    <small class="text-red-500">{{ form.controls.companyName.errors?.['api'] }}</small>
                                }
                            </div>
                            <div class="flex flex-col gap-2">
                                <label for="userName" class="font-medium">Tu nombre</label>
                                <input pInputText id="userName" formControlName="userName" autocomplete="name" [maxlength]="userNameMax" />
                                @if (form.controls.userName.errors?.['api']) {
                                    <small class="text-red-500">{{ form.controls.userName.errors?.['api'] }}</small>
                                }
                            </div>
                            <div class="flex flex-col gap-2">
                                <label for="email" class="font-medium">Email</label>
                                <input pInputText id="email" formControlName="email" type="email" autocomplete="username" placeholder="tu@empresa.com" [maxlength]="emailMax" />
                                @if (form.controls.email.errors?.['api']) {
                                    <small class="text-red-500">{{ form.controls.email.errors?.['api'] }}</small>
                                }
                            </div>
                            <app-terms-checkbox [control]="form.controls.acceptTerms" />
                            <p-button type="submit" label="Crear mi cuenta" styleClass="w-full" [loading]="loading()" [disabled]="form.invalid" data-testid="register-submit" />
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
export class Register {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);

    readonly requestedMessage = REGISTRATION_REQUESTED_MESSAGE;
    readonly companyNameMax = COMPANY_NAME_MAX_LENGTH;
    readonly userNameMax = USER_NAME_MAX_LENGTH;
    readonly emailMax = EMAIL_MAX_LENGTH;

    readonly loading = signal(false);
    readonly requested = signal(false);
    readonly error = signal<string | null>(null);

    readonly form = this.fb.nonNullable.group({
        companyName: ['', [Validators.required, notBlank, Validators.maxLength(COMPANY_NAME_MAX_LENGTH)]],
        userName: ['', [Validators.required, notBlank, Validators.maxLength(USER_NAME_MAX_LENGTH)]],
        email: ['', [Validators.required, notBlank, trimmedEmail, Validators.maxLength(EMAIL_MAX_LENGTH)]],
        acceptTerms: [false, [Validators.requiredTrue]]
    });

    submit(): void {
        if (this.form.invalid || this.loading()) {
            return;
        }
        // Recortados: la API también lo hace, pero lo que se envía es lo que la persona verá en su cuenta.
        const { companyName, userName, email } = this.form.getRawValue();
        this.loading.set(true);
        this.error.set(null);

        this.authService
            .requestRegistration({ companyName: companyName.trim(), userName: userName.trim(), email: email.trim(), acceptedTermsVersion: TERMS_VERSION })
            .subscribe((result) => {
                this.loading.set(false);
                if (result.isSuccess) {
                    // El mismo mensaje para cualquier 202. Nada de lo escrito se queda en la pantalla ni en memoria: ni el email ni los nombres hacen falta ya.
                    this.form.reset();
                    this.requested.set(true);
                    return;
                }
                this.showFailure(result.message, result.fieldErrors);
            });
    }

    // Los errores de campo (400) se pintan en su campo; la API los nombra como las propiedades C# («Email»), el formulario en minúscula. Lo que no tiene campo (la versión de las
    // condiciones que ya no es la vigente, el límite de la IP, la red) va arriba, con el texto de la API.
    private showFailure(message: string, fieldErrors: FieldError[] | undefined): void {
        const general: string[] = fieldErrors?.length ? [] : [message];
        for (const fieldError of fieldErrors ?? []) {
            const name = fieldError.field.charAt(0).toLowerCase() + fieldError.field.slice(1);
            const control = name === 'companyName' || name === 'userName' || name === 'email' ? this.form.controls[name] : null;
            if (control) {
                control.setErrors({ ...control.errors, api: fieldError.message });
                control.markAsTouched();
            } else {
                general.push(fieldError.message);
            }
        }
        if (general.length) {
            this.error.set(general.join(' '));
        }
    }
}
