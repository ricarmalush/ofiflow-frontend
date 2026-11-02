import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth';
import { CurrentSessionService } from '../../../../core/services/current-session';
import { buildAccount } from '../../../../core/testing/fake-account';
import { buildSessionToken } from '../../../../core/testing/fake-jwt';
import { InvitationCreated } from '../../../../shared/models/team-member.model';
import { INVITATION_WITHOUT_DELIVERY_MESSAGE, TeamComponent, buildInvitationLink } from './team.component';

const usersUrl = `${environment.apiUrl}/users`;
const invitationsUrl = `${environment.apiUrl}/invitations`;
const created = { status: 201, statusText: 'Created' };

function createdInvitation(overrides: Partial<InvitationCreated> = {}): InvitationCreated {
    return { id: 'inv-1', token: null, expiresAt: '2030-01-15T10:30:00Z', emailSent: true, ...overrides };
}

describe('TeamComponent · invitar (spec 009 y 017)', () => {
    let httpMock: HttpTestingController;
    let fixture: ComponentFixture<TeamComponent>;
    let component: TeamComponent;

    // Monta la pantalla como Owner (puede invitar) y responde a la carga de miembros e invitaciones pendientes.
    function open(): void {
        const auth = TestBed.inject(AuthService);
        auth.storeSession({ accessToken: buildSessionToken(), refreshToken: 'refresh-1', expiresAt: '2030-01-01T00:00:00Z' });
        TestBed.inject(CurrentSessionService).setAccount(buildAccount({ role: 'Owner' }));

        fixture = TestBed.createComponent(TeamComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        httpMock.expectOne(usersUrl).flush([]);
        httpMock.expectOne(invitationsUrl).flush([]);
        fixture.detectChanges();
    }

    // Abre el diálogo, escribe el email como lo haría una persona y envía el formulario.
    function invite(email: string): void {
        component.openInvite();
        fixture.detectChanges();
        const input = document.body.querySelector('#inviteEmail') as HTMLInputElement;
        input.value = email;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        component.sendInvite();
    }

    const dialogText = () => document.body.querySelector('.p-dialog')?.textContent ?? '';
    const dialogInput = () => document.body.querySelector('input[aria-label="Enlace de invitación"]') as HTMLInputElement | null;
    const pendingInvitationsReload = () => httpMock.expectOne((r) => r.url === invitationsUrl && r.method === 'GET').flush([]);

    beforeEach(() => {
        sessionStorage.clear();
        TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), MessageService, ConfirmationService] });
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        fixture?.destroy();
        httpMock.verify();
        sessionStorage.clear();
    });

    it('con correo: dice a quién se envió, sin enlace que copiar', () => {
        open();
        invite('  ana@empresa.es  ');

        const request = httpMock.expectOne((r) => r.url === invitationsUrl && r.method === 'POST');
        expect(request.request.body.email).toBe('ana@empresa.es');
        request.flush(createdInvitation({ emailSent: true, token: null }), created);
        pendingInvitationsReload();
        fixture.detectChanges();

        expect(dialogText()).toContain('Hemos enviado la invitación a ana@empresa.es');
        expect(dialogText()).toContain('caduca el 15/01/2030');
        expect(dialogInput()).toBeNull();
        expect(document.body.querySelector('button[aria-label="Copiar enlace"]')).toBeNull();
        expect(component.inviteLink()).toBeNull();
        expect(component.inviteError()).toBeNull();
    });

    it('con correo: tras enviar, la lista de pendientes se recarga', () => {
        open();
        invite('ana@empresa.es');

        httpMock.expectOne((r) => r.method === 'POST').flush(createdInvitation(), created);

        // Si no se pidiera, la persona recién invitada no aparecería hasta recargar la página.
        const reload = httpMock.expectOne((r) => r.url === invitationsUrl && r.method === 'GET');
        reload.flush([{ id: 'inv-1', email: 'ana@empresa.es', role: 'Employee', expiresAt: '2030-01-15T10:30:00Z', createdAt: '2030-01-08T10:30:00Z' }]);
        expect(component.invitations().length).toBe(1);
    });

    it('sin correo: enseña el enlace con el token en el fragmento, y avisa de que no se envió nada', () => {
        open();
        invite('ana@empresa.es');

        httpMock.expectOne((r) => r.method === 'POST').flush(createdInvitation({ emailSent: false, token: 'tok_ABC-123' }), created);
        pendingInvitationsReload();
        fixture.detectChanges();

        expect(dialogInput()?.value).toBe(`${location.origin}/auth/accept-invitation#token=tok_ABC-123`);
        expect(dialogText()).toContain('El correo no está configurado');
        expect(dialogText()).toContain('invitación no se ha enviado');
        expect(dialogText()).not.toContain('Hemos enviado');
        expect(document.body.querySelector('button[aria-label="Copiar enlace"]')).not.toBeNull();
        expect(component.inviteSent()).toBeNull();
    });

    it('si el correo no sale (502 invitation.email_not_sent): enseña el texto de la API y deja el formulario para reintentar', () => {
        open();
        invite('ana@empresa.es');

        httpMock
            .expectOne((r) => r.method === 'POST')
            .flush({ status: 502, detail: 'No se ha podido enviar el correo de la invitación, así que no se ha creado.', code: 'invitation.email_not_sent' }, { status: 502, statusText: 'Bad Gateway' });
        fixture.detectChanges();

        expect(component.inviteError()).toBe('No se ha podido enviar el correo de la invitación, así que no se ha creado.');
        expect(dialogText()).toContain('así que no se ha creado');
        expect(document.body.querySelector('#inviteEmail')).not.toBeNull(); // el formulario sigue ahí
        expect(component.inviteSent()).toBeNull();
        expect(component.inviteLink()).toBeNull();

        // Y se puede repetir: la API no creó nada, así que no choca con «ya hay una pendiente».
        component.sendInvite();
        httpMock.expectOne((r) => r.method === 'POST').flush(createdInvitation(), created);
        pendingInvitationsReload();
        expect(component.inviteSent()?.email).toBe('ana@empresa.es');
        expect(component.inviteError()).toBeNull();
    });

    it('un fallo no recarga la lista de pendientes: no se creó nada', () => {
        open();
        invite('ana@empresa.es');

        httpMock.expectOne((r) => r.method === 'POST').flush({ detail: 'No se ha podido enviar.', code: 'invitation.email_not_sent' }, { status: 502, statusText: 'Bad Gateway' });

        httpMock.expectNone((r) => r.url === invitationsUrl && r.method === 'GET');
    });

    it('el límite de invitaciones (429) se enseña tal cual y no deja nada a medias', () => {
        open();
        invite('ana@empresa.es');

        httpMock.expectOne((r) => r.method === 'POST').flush({ status: 429, detail: 'Has hecho demasiadas peticiones. Espera un poco.', code: 'rate_limit.exceeded' }, { status: 429, statusText: 'Too Many Requests' });
        fixture.detectChanges();

        expect(component.inviteError()).toBe('Has hecho demasiadas peticiones. Espera un poco.');
        expect(component.inviteSent()).toBeNull();
        expect(component.inviteLink()).toBeNull();
    });

    it('una respuesta sin enlace y sin confirmación de correo no se da por entregada', () => {
        open();
        invite('ana@empresa.es');

        httpMock.expectOne((r) => r.method === 'POST').flush(createdInvitation({ emailSent: false, token: null }), created);
        pendingInvitationsReload();
        fixture.detectChanges();

        expect(component.inviteError()).toBe(INVITATION_WITHOUT_DELIVERY_MESSAGE);
        expect(component.inviteSent()).toBeNull();
        expect(component.inviteLink()).toBeNull();
        expect(dialogText()).not.toContain('Hemos enviado');
    });

    it('al cerrar se olvida todo; al abrir otra vez vuelve el formulario vacío', () => {
        open();
        invite('ana@empresa.es');
        httpMock.expectOne((r) => r.method === 'POST').flush(createdInvitation(), created);
        pendingInvitationsReload();
        fixture.detectChanges();
        expect(component.inviteSent()).not.toBeNull();

        component.closeInvite();
        expect(component.inviteSent()).toBeNull();
        expect(component.inviteLink()).toBeNull();

        component.openInvite();
        fixture.detectChanges();
        expect(component.inviteSent()).toBeNull();
        expect(component.inviteForm.getRawValue().email).toBe('');
        expect(document.body.querySelector('#inviteEmail')).not.toBeNull();
    });

    it('abrir el diálogo nunca enseña lo de la invitación anterior, aunque no se haya cerrado antes', () => {
        open();
        // Un estado que quedó puesto (por ejemplo, el diálogo se cerró de una forma que no pasó por closeInvite): abrir debe empezar de cero.
        component.inviteSent.set({ email: 'ana@empresa.es', expiresAt: '2030-01-15T10:30:00Z' });
        component.inviteLink.set('https://app.ejemplo.com/auth/accept-invitation#token=viejo');

        component.openInvite();
        fixture.detectChanges();

        expect(component.inviteSent()).toBeNull();
        expect(component.inviteLink()).toBeNull();
        expect(document.body.querySelector('#inviteEmail')).not.toBeNull();
    });

    it('el enlace manual de una invitación anterior no sobrevive a la siguiente', () => {
        open();
        invite('ana@empresa.es');
        httpMock.expectOne((r) => r.method === 'POST').flush(createdInvitation({ emailSent: false, token: 'primer-token' }), created);
        pendingInvitationsReload();
        expect(component.inviteLink()).toContain('primer-token');

        // Cerrar ya lo olvida (sin esperar a que se vuelva a abrir): el enlace no se queda en memoria.
        component.closeInvite();
        expect(component.inviteLink()).toBeNull();

        invite('luis@empresa.es');
        httpMock.expectOne((r) => r.method === 'POST').flush(createdInvitation({ emailSent: true, token: null }), created);
        pendingInvitationsReload();

        expect(component.inviteLink()).toBeNull();
        expect(component.inviteSent()?.email).toBe('luis@empresa.es');
    });
});

describe('buildInvitationLink', () => {
    it('pone el token en el fragmento (#), nunca en la query, y lo codifica', () => {
        const link = buildInvitationLink('a b&c#d', 'https://app.ejemplo.com');

        expect(link).toBe('https://app.ejemplo.com/auth/accept-invitation#token=a%20b%26c%23d');
        expect(link).not.toContain('?');
    });
});
