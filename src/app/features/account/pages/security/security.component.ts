import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { TagModule } from 'primeng/tag';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/services/auth';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { qrDataUrl } from '../../../../core/utils/qr.util';
import { MfaStatus } from '../../../../shared/models/mfa.model';
import { SessionInfo } from '../../../../shared/models/session.model';
import { OperationResult } from '../../../../shared/models/result.model';
import { MfaService } from '../../services/mfa.service';
import { SessionsService } from '../../services/sessions.service';
import { ChangePasswordComponent } from './change-password.component';

// Qué está viendo la persona. Los pasos de activar van en orden: contraseña → escanear y
// confirmar con un código → guardar los códigos de recuperación.
type View = 'status' | 'setup-password' | 'setup-scan' | 'disable' | 'regenerate' | 'codes';

const SESSION_CLOSED_MESSAGE = 'Por seguridad se han cerrado todas tus sesiones. Vuelve a entrar.';

@Component({
    selector: 'app-security',
    standalone: true,
    imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, PasswordModule, MessageModule, TagModule, CheckboxModule, ChangePasswordComponent],
    templateUrl: './security.component.html'
})
export class SecurityComponent implements OnInit {
    private mfaService = inject(MfaService);
    private authService = inject(AuthService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private currentSession = inject(CurrentSessionService);
    private sessionsService = inject(SessionsService);
    private fb = inject(FormBuilder);

    readonly view = signal<View>('status');
    readonly status = signal<MfaStatus | null>(null);
    readonly loading = signal(false);
    readonly busy = signal(false);
    readonly error = signal<string | null>(null);

    // Mis sesiones (specs 014 y 016 de la API). Los permisos solo sirven para pintar: la API vuelve a comprobarlos.
    // Ver la lista es Account.Read; cerrar una o todas es Account.CloseSessions. Son independientes: cada cosa se ofrece por su permiso.
    // Quien debe activar el segundo factor (spec 022) no puede listar sesiones: la API se lo deniega, así que no se ofrece ni se pide.
    readonly mustEnroll = this.currentSession.mustEnrollSecondFactor;
    // El rol exige el factor (lo tenga activo o no): no se ofrece «Desactivar». Lo dice la API (me.secondFactorRequired); aquí no se copia qué roles lo exigen.
    readonly secondFactorRequired = this.currentSession.secondFactorRequired;
    // Cambiar la contraseña (spec 019): con el permiso y sin tener que activar antes el segundo factor (la API le daría 403: la lista cerrada de operaciones permitidas no la incluye).
    readonly canChangePassword = computed(() => this.currentSession.can('Account.ChangePassword') && !this.mustEnroll());
    readonly canListSessions = computed(() => this.currentSession.can('Account.Read') && !this.mustEnroll());
    readonly canCloseSessions = computed(() => this.currentSession.can('Account.CloseSessions') && !this.mustEnroll());
    readonly showSessionsCard = computed(() => this.canListSessions() || this.canCloseSessions());
    readonly sessions = signal<SessionInfo[] | null>(null);
    readonly sessionsLoading = signal(false);
    readonly closingAll = signal(false);
    // El Id de la sesión que se está cerrando (una a la vez, y tampoco mientras se cierran todas).
    readonly closingId = signal<string | null>(null);
    readonly sessionsError = signal<string | null>(null);
    readonly closingAny = computed(() => this.closingAll() || this.closingId() !== null);

    // Tras cambiar la contraseña la API cerró las demás sesiones: la lista que se ve está desfasada.
    onPasswordChanged(): void {
        if (this.canListSessions()) this.loadSessions();
    }

    constructor() {
        // La lista se pide en cuanto hay permiso para verla (la cuenta puede cargarse después que la pantalla, o cambiar de rol).
        effect(() => {
            if (this.canListSessions()) untracked(() => this.loadSessions());
        });
    }

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
        // Quien debe activar el factor llega DIRECTAMENTE al asistente (spec 022 D9): sin pasar por el estado y un botón más.
        if (this.mustEnroll()) {
            this.go('setup-password');
        }
    }

    go(view: View): void {
        // Un rol que exige el factor no puede desactivarlo (la API lo rechaza con mfa.required_for_role): ni se abre ese paso.
        if (view === 'disable' && this.secondFactorRequired()) {
            return;
        }
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
        if (this.secondFactorRequired() || this.passwordAndCodeForm.invalid || this.busy()) return;
        const { password, code } = this.passwordAndCodeForm.getRawValue();
        this.run(this.mfaService.disable(password, code.trim()), () => this.authService.logout(SESSION_CLOSED_MESSAGE));
    }

    regenerate(): void {
        if (this.passwordAndCodeForm.invalid || this.busy()) return;
        const { password, code } = this.passwordAndCodeForm.getRawValue();
        this.run(this.mfaService.regenerateRecoveryCodes(password, code.trim()), (result) => this.showCodes(result.codes, false));
    }

    // Pide confirmación antes: es la única acción de esta pantalla que echa también a quien la pulsa, y no se deshace.
    confirmCloseAllSessions(): void {
        if (this.closingAny()) return;
        this.confirmationService.confirm({
            header: 'Cerrar todas mis sesiones',
            message: 'Se cerrarán tus sesiones en todos tus dispositivos, también en este, y tendrás que volver a entrar. ¿Continuar?',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Cerrar todas',
            rejectLabel: 'Volver',
            acceptButtonStyleClass: 'p-button-danger',
            rejectButtonStyleClass: 'p-button-secondary p-button-text',
            accept: () => this.closeAllSessions()
        });
    }

    // Si sale bien, AuthService borra lo local y lleva al login con el aviso; si falla, la persona sigue dentro y se le dice.
    private closeAllSessions(): void {
        this.closingAll.set(true);
        this.sessionsError.set(null);
        this.authService.closeAllSessions().subscribe((result) => {
            this.closingAll.set(false);
            if (!result.isSuccess) this.sessionsError.set(result.message);
        });
    }

    // Cerrar otra sesión no echa a nadie de aquí, así que no pide confirmación; cerrar ESTA sí, porque lleva al login.
    closeSession(session: SessionInfo): void {
        if (this.closingAny()) return;
        if (!session.current) {
            this.runCloseSession(session);
            return;
        }
        this.confirmationService.confirm({
            header: 'Cerrar esta sesión',
            message: 'Se cerrará la sesión de este dispositivo y tendrás que volver a entrar. ¿Continuar?',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Cerrar esta sesión',
            rejectLabel: 'Volver',
            acceptButtonStyleClass: 'p-button-danger',
            rejectButtonStyleClass: 'p-button-secondary p-button-text',
            accept: () => this.runCloseSession(session)
        });
    }

    // Si era otra sesión, se refresca la lista; si era esta, AuthService ya llevó al login. Si falla, nada cambia y se dice.
    private runCloseSession(session: SessionInfo): void {
        this.closingId.set(session.id);
        this.sessionsError.set(null);
        this.authService.closeSession(session.id, session.current).subscribe((result) => {
            this.closingId.set(null);
            if (!result.isSuccess) {
                this.sessionsError.set(result.message);
                // Un 404 significa que ya no estaba (la cerró otro dispositivo): la lista que se ve está desfasada.
                this.loadSessions();
            } else if (!session.current) {
                this.loadSessions();
            }
        });
    }

    private loadSessions(): void {
        this.sessionsLoading.set(true);
        this.sessionsService.list().subscribe((result) => {
            this.sessionsLoading.set(false);
            if (result.isSuccess) {
                this.sessions.set(result.data ?? []);
            } else {
                this.sessionsError.set(result.message);
            }
        });
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
