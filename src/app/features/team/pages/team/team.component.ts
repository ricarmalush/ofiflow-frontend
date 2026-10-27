import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { escapeHtml } from '../../../../core/utils/escape-html.util';
import { TenantRole } from '../../../../shared/models/auth.model';
import { Invitation, MANAGEABLE_ROLES, ROLE_LABELS, TeamMember, canManage } from '../../../../shared/models/team-member.model';
import { TeamService } from '../../services/team.service';

@Component({
    selector: 'app-team',
    standalone: true,
    imports: [DatePipe, FormsModule, ReactiveFormsModule, TableModule, ButtonModule, TagModule, ToolbarModule, MessageModule, SelectModule, DialogModule, InputTextModule, InputGroupModule],
    templateUrl: './team.component.html'
})
export class TeamComponent implements OnInit {
    private teamService = inject(TeamService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private session = inject(CurrentSessionService);
    private fb = inject(FormBuilder);

    readonly members = signal<TeamMember[]>([]);
    readonly invitations = signal<Invitation[]>([]);
    readonly loading = signal(false);
    readonly errorMessage = signal<string | null>(null);
    readonly busyId = signal<string | null>(null);

    readonly canManageUsers = computed(() => this.session.can('Users.Manage'));
    private readonly actorRole = this.session.role;
    // Los roles que este usuario puede conceder: el desplegable de invitar y el de cambiar rol.
    readonly grantableRoles = computed(() => {
        const role = this.actorRole();
        return (role ? MANAGEABLE_ROLES[role] : []).map((value) => ({ label: ROLE_LABELS[value], value }));
    });

    // Diálogo de invitar. Tras crearla, el mismo diálogo enseña el enlace (una sola vez).
    inviteOpen = false;
    readonly inviting = signal(false);
    readonly inviteError = signal<string | null>(null);
    readonly inviteLink = signal<string | null>(null);
    readonly inviteForm = this.fb.nonNullable.group({
        email: ['', [Validators.required, Validators.email]],
        role: this.fb.nonNullable.control<TenantRole>('Technician', Validators.required)
    });

    ngOnInit(): void {
        this.load();
    }

    roleLabel(role: TenantRole): string {
        return ROLE_LABELS[role] ?? role;
    }

    // ¿Puedo cambiar, quitar o reiniciar el MFA de este miembro? Nunca a uno mismo ni al Owner,
    // y un Admin no toca a otro Admin. La API lo vuelve a comprobar y respondería 403.
    canActOn(member: TeamMember): boolean {
        return this.canManageUsers() && !member.isCurrentUser && canManage(this.actorRole(), member.role);
    }

    changeRole(member: TeamMember, role: TenantRole): void {
        if (role === member.role) {
            return;
        }
        this.busyId.set(member.id);
        this.teamService.changeRole(member.id, role).subscribe((result) => {
            this.busyId.set(null);
            this.notify(result.isSuccess, 'Rol cambiado', 'No se pudo cambiar el rol', result.isSuccess ? `${member.name}: ${this.roleLabel(role)}` : result.message);
            this.load();
        });
    }

    confirmRemove(member: TeamMember): void {
        this.confirmationService.confirm({
            header: 'Quitar del equipo',
            message: `¿Quitar a "${escapeHtml(member.name)}"? Se borran su cuenta y sus datos, se cierran sus sesiones y sus trabajos sin terminar quedan sin asignar. No se puede deshacer.`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Quitar',
            rejectLabel: 'Cancelar',
            acceptButtonStyleClass: 'p-button-danger',
            rejectButtonStyleClass: 'p-button-secondary p-button-text',
            accept: () => this.runOnMember(member, this.teamService.remove(member.id), 'Miembro quitado', 'No se pudo quitar')
        });
    }

    confirmResetMfa(member: TeamMember): void {
        this.confirmationService.confirm({
            header: 'Reiniciar segundo factor',
            message: `¿Reiniciar el segundo factor de "${escapeHtml(member.name)}"? Se borran su app y sus códigos de recuperación y se cierran sus sesiones. Úsalo solo si ha perdido el acceso, y confirma antes que es esa persona quien te lo pide.`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Reiniciar',
            rejectLabel: 'Cancelar',
            acceptButtonStyleClass: 'p-button-warn',
            rejectButtonStyleClass: 'p-button-secondary p-button-text',
            accept: () => this.runOnMember(member, this.teamService.resetMfa(member.id), 'Segundo factor reiniciado', 'No se pudo reiniciar')
        });
    }

    openInvite(): void {
        this.inviteForm.reset({ email: '', role: this.grantableRoles().at(-1)?.value ?? 'Employee' });
        this.inviteError.set(null);
        this.inviteLink.set(null);
        this.inviteOpen = true;
    }

    // Al cerrar se olvida el enlace: no se queda en memoria ni se puede volver a ver.
    closeInvite(): void {
        this.inviteOpen = false;
        this.inviteLink.set(null);
    }

    sendInvite(): void {
        if (this.inviteForm.invalid || this.inviting()) {
            this.inviteForm.markAllAsTouched();
            return;
        }
        const { email, role } = this.inviteForm.getRawValue();
        this.inviting.set(true);
        this.inviteError.set(null);
        this.teamService.invite(email.trim(), role).subscribe((result) => {
            this.inviting.set(false);
            if (!result.isSuccess || !result.data) {
                this.inviteError.set(result.message);
                return;
            }
            this.inviteLink.set(buildInvitationLink(result.data.token));
            this.loadInvitations();
        });
    }

    copyInviteLink(): void {
        const link = this.inviteLink();
        if (!link) {
            return;
        }
        navigator.clipboard.writeText(link).then(
            () => this.messageService.add({ severity: 'success', summary: 'Enlace copiado' }),
            () => this.messageService.add({ severity: 'warn', summary: 'No se pudo copiar', detail: 'Selecciónalo y cópialo a mano.' })
        );
    }

    confirmRevoke(invitation: Invitation): void {
        this.confirmationService.confirm({
            header: 'Revocar invitación',
            message: `¿Revocar la invitación de "${escapeHtml(invitation.email)}"? Su enlace dejará de funcionar.`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Revocar',
            rejectLabel: 'Cancelar',
            acceptButtonStyleClass: 'p-button-danger',
            rejectButtonStyleClass: 'p-button-secondary p-button-text',
            accept: () =>
                this.teamService.revokeInvitation(invitation.id).subscribe((result) => {
                    this.notify(result.isSuccess, 'Invitación revocada', 'No se pudo revocar', result.isSuccess ? invitation.email : result.message);
                    this.loadInvitations();
                })
        });
    }

    private runOnMember(member: TeamMember, request: ReturnType<TeamService['remove']>, done: string, failed: string): void {
        this.busyId.set(member.id);
        request.subscribe((result) => {
            this.busyId.set(null);
            this.notify(result.isSuccess, done, failed, result.isSuccess ? member.name : result.message);
            this.load();
        });
    }

    private notify(ok: boolean, done: string, failed: string, detail: string): void {
        this.messageService.add({ severity: ok ? 'success' : 'error', summary: ok ? done : failed, detail });
    }

    private load(): void {
        this.loading.set(true);
        this.teamService.list().subscribe((result) => {
            this.loading.set(false);
            this.members.set(result.data ?? []);
            this.errorMessage.set(result.isSuccess ? null : result.message);
        });
        this.loadInvitations();
    }

    private loadInvitations(): void {
        if (!this.canManageUsers()) {
            return;
        }
        this.teamService.listInvitations().subscribe((result) => this.invitations.set(result.data ?? []));
    }
}

// El token va en el fragmento (#), no en la query (?): el navegador nunca envía el fragmento al
// servidor, así que no acaba en logs de servidores o proxies ni en la cabecera Referer. La
// página de aceptar lo lee y lo borra de la barra de direcciones.
export function buildInvitationLink(token: string, origin: string = location.origin): string {
    return `${origin}/auth/accept-invitation#token=${encodeURIComponent(token)}`;
}
