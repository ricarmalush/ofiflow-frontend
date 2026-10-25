import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { TagModule } from 'primeng/tag';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/services/auth';
import { qrDataUrl } from '../../../../core/utils/qr.util';
import { MfaStatus } from '../../../../shared/models/mfa.model';
import { OperationResult } from '../../../../shared/models/result.model';
import { MfaService } from '../../services/mfa.service';

// Qué está viendo la persona. Los pasos de activar van en orden: contraseña → escanear y
// confirmar con un código → guardar los códigos de recuperación.
type View = 'status' | 'setup-password' | 'setup-scan' | 'disable' | 'regenerate' | 'codes';

const SESSION_CLOSED_MESSAGE = 'Por seguridad se han cerrado todas tus sesiones. Vuelve a entrar.';

@Component({
    selector: 'app-security',
    standalone: true,
    imports: [NgTemplateOutlet, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, PasswordModule, MessageModule, TagModule, CheckboxModule],
    templateUrl: './security.component.html'
})
export class SecurityComponent implements OnInit {
    private mfaService = inject(MfaService);
    private authService = inject(AuthService);
    private messageService = inject(MessageService);
    private fb = inject(FormBuilder);

    readonly view = signal<View>('status');
    readonly status = signal<MfaStatus | null>(null);
    readonly loading = signal(false);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);

    // Secretos de un solo uso: solo en memoria, mientras dura el paso, y se borran al salir de él.
    readonly secret = signal<string | null>(null);
    readonly qr = signal<string | null>(null);
    readonly recoveryCodes = signal<string[]>([]);
    // Tras activar, al terminar de guardar los códigos hay que volver a entrar (la API cerró las sesiones).
    private logoutAfterCodes = false;
    codesSaved = false;

    readonly passwordForm = this.fb.nonNullable.group({ password: ['', Validators.required] });
    readonly codeForm = this.fb.nonNullable.group({ code: ['', [Validators.required, Validators.maxLength(64)]] });
    readonly passwordAndCodeForm = this.fb.nonNullable.group({
        password: ['', Validators.required],
        code: ['', [Validators.required, Validators.maxLength(64)]]
    });

    ngOnInit(): void {
        this.loadStatus();
    }

    go(view: View): void {
        this.error.set(null);
        this.passwordForm.reset();
        this.codeForm.reset();
        this.passwordAndCodeForm.reset();
        this.view.set(view);
    }

    cancel(): void {
        this.forgetSecrets();
        this.go('status');
    }

    startSetup(): void {
        if (this.passwordForm.invalid || this.busy()) return;
        this.run(this.mfaService.startSetup(this.passwordForm.getRawValue().password), (setup) => {
            this.secret.set(setup.secret);
            this.qr.set(qrDataUrl(setup.otpAuthUri));
            this.go('setup-scan');
        });
    }

    enable(): void {
        if (this.codeForm.invalid || this.busy()) return;
        this.run(this.mfaService.enable(this.codeForm.getRawValue().code.trim()), (result) => {
            this.secret.set(null);
            this.qr.set(null);
            this.showCodes(result.codes, true);
        });
    }

    disable(): void {
        if (this.passwordAndCodeForm.invalid || this.busy()) return;
        const { password, code } = this.passwordAndCodeForm.getRawValue();
        this.run(this.mfaService.disable(password, code.trim()), () => this.authService.logout(SESSION_CLOSED_MESSAGE));
    }

    regenerate(): void {
        if (this.passwordAndCodeForm.invalid || this.busy()) return;
        const { password, code } = this.passwordAndCodeForm.getRawValue();
        this.run(this.mfaService.regenerateRecoveryCodes(password, code.trim()), (result) => this.showCodes(result.codes, false));
    }

    copyCodes(): void {
        navigator.clipboard.writeText(this.recoveryCodes().join('\n')).then(
            () => this.messageService.add({ severity: 'success', summary: 'Códigos copiados' }),
            () => this.messageService.add({ severity: 'warn', summary: 'No se pudo copiar', detail: 'Cópialos a mano.' })
        );
    }

    // El fichero se genera en el navegador; no pasa por ningún servidor.
    downloadCodes(): void {
        const text = ['Códigos de recuperación de OfiFlow', 'Cada código sirve una sola vez.', '', ...this.recoveryCodes()].join('\n');
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'ofiflow-codigos-recuperacion.txt';
        link.click();
        URL.revokeObjectURL(url);
    }

    finishCodes(): void {
        this.recoveryCodes.set([]);
        this.codesSaved = false;
        if (this.logoutAfterCodes) {
            this.authService.logout(SESSION_CLOSED_MESSAGE);
            return;
        }
        this.go('status');
        this.loadStatus();
    }

    private showCodes(codes: string[], logoutAfter: boolean): void {
        this.recoveryCodes.set(codes);
        this.logoutAfterCodes = logoutAfter;
        this.codesSaved = false;
        this.go('codes');
    }

    private forgetSecrets(): void {
        this.secret.set(null);
        this.qr.set(null);
        this.recoveryCodes.set([]);
    }

    private loadStatus(): void {
        this.loading.set(true);
        this.mfaService.status().subscribe((result) => {
            this.loading.set(false);
            this.status.set(result.data ?? null);
            if (!result.isSuccess) this.error.set(result.message);
        });
    }

    private run<T>(request: Observable<OperationResult<T>>, onSuccess: (data: T) => void): void {
        this.busy.set(true);
        this.error.set(null);
        request.subscribe((result) => {
            this.busy.set(false);
            if (result.isSuccess) {
                onSuccess(result.data as T);
            } else {
                this.error.set(result.message);
            }
        });
    }
}
