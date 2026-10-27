import { Injectable, computed, signal } from '@angular/core';
import { jwtDecode } from 'jwt-decode';
import { CurrentAccount } from '../../shared/models/account.model';
import { TenantRole } from '../../shared/models/auth.model';
import { Permission } from '../../shared/models/permission.model';

// Nombres de claim tal como los escribe TokenService en la API ("sub", "tenant_id", "role"):
// la API desactiva el renombrado de JwtBearer, así que no llegan como URIs de ClaimTypes.
interface JwtClaims {
    sub?: string;
    tenant_id?: string;
    role?: TenantRole;
    exp?: number;
}

export interface SessionInfo {
    userId: string;
    tenantId: string;
    // El rol que dijo el token al emitirse. Es INFORMATIVO y puede estar desfasado (si un gestor lo
    // cambió después): para decidir qué pintar se usa el rol de la cuenta (GET /account/me), no este.
    tokenRole: TenantRole;
    // Caducidad del access token, en milisegundos (como Date.now()).
    expiresAt: number;
}

// Única fuente de verdad sobre "quién soy". Reúne dos cosas con orígenes distintos:
//
//  - la SESIÓN (el JWT que firmó la API): si hay sesión y cuándo caduca. Se decodifica aquí y en
//    ningún otro sitio. Ojo: decodificar no es verificar; el navegador no tiene la clave.
//  - la CUENTA (GET /account/me): quién soy, mi empresa, mi rol efectivo y mis permisos, tal como
//    los dice la API ahora. Los carga AccountService. Hasta que llegan no hay ningún permiso: ante
//    la duda, la interfaz no ofrece nada (fail-closed).
//
// Todo esto es para PINTAR la interfaz; quien decide qué se permite es siempre la API.
@Injectable({
    providedIn: 'root'
})
export class CurrentSessionService {
    private readonly token = signal<string | null>(null);
    private readonly currentAccount = signal<CurrentAccount | null>(null);

    // Señales derivadas: el menú y la barra superior se recalculan solos al entrar, salir o cambiar la cuenta.
    readonly session = computed(() => this.decode(this.token()));
    readonly tenantId = computed(() => this.session()?.tenantId ?? null);
    readonly account = this.currentAccount.asReadonly();

    // El rol EFECTIVO (el de la base de datos), nunca el del token.
    readonly role = computed(() => this.currentAccount()?.role ?? null);
    readonly membershipId = computed(() => this.currentAccount()?.membershipId ?? null);
    readonly permissions = computed(() => new Set<string>(this.currentAccount()?.permissions ?? []));

    // Para la interfaz (mostrar u ocultar). Sin cuenta cargada, o con un permiso que la API no dio, es false.
    can(permission: Permission): boolean {
        return this.permissions().has(permission);
    }

    establish(accessToken: string | null): void {
        // Otra persona (o ninguna) en el mismo navegador: la cuenta de la anterior no se hereda.
        if (this.decode(accessToken)?.userId !== this.session()?.userId) {
            this.currentAccount.set(null);
        }
        this.token.set(accessToken);
    }

    setAccount(account: CurrentAccount): void {
        this.currentAccount.set(account);
    }

    clear(): void {
        this.token.set(null);
        this.currentAccount.set(null);
    }

    isExpired(now: number = Date.now()): boolean {
        const session = this.session();
        return !session || session.expiresAt <= now;
    }

    private decode(token: string | null): SessionInfo | null {
        if (!token) {
            return null;
        }

        try {
            const claims = jwtDecode<JwtClaims>(token);
            if (!claims.sub || !claims.tenant_id || !claims.role || !claims.exp) {
                return null;
            }
            return { userId: claims.sub, tenantId: claims.tenant_id, tokenRole: claims.role, expiresAt: claims.exp * 1000 };
        } catch {
            return null;
        }
    }
}
