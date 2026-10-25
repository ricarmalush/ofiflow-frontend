import { Injectable, computed, signal } from '@angular/core';
import { jwtDecode } from 'jwt-decode';
import { TenantRole } from '../../shared/models/auth.model';
import { Permission, ROLE_PERMISSIONS } from '../../shared/models/permission.model';

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
    role: TenantRole;
    // Caducidad del access token, en milisegundos (como Date.now()).
    expiresAt: number;
}

// Única fuente de verdad sobre "quién soy, de qué empresa y con qué rol". Lo lee del JWT, que
// la API ha firmado; nada fuera de aquí decodifica el token.
// Ojo: decodificar no es verificar. El navegador no tiene la clave para comprobar la firma, así
// que esto solo sirve para pintar la interfaz; quien decide qué se permite es siempre la API.
@Injectable({
    providedIn: 'root'
})
export class CurrentSessionService {
    private readonly token = signal<string | null>(null);

    // Señales derivadas: el menú y la barra superior se recalculan solos al entrar o salir.
    readonly session = computed(() => this.decode(this.token()));
    readonly role = computed(() => this.session()?.role ?? null);
    readonly tenantId = computed(() => this.session()?.tenantId ?? null);
    readonly permissions = computed(() => {
        const role = this.role();
        return new Set<Permission>(role ? (ROLE_PERMISSIONS[role] ?? []) : []);
    });

    // Para la interfaz (mostrar u ocultar). Un rol desconocido no tiene ningún permiso.
    can(permission: Permission): boolean {
        return this.permissions().has(permission);
    }

    establish(accessToken: string | null): void {
        this.token.set(accessToken);
    }

    clear(): void {
        this.token.set(null);
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
            return { userId: claims.sub, tenantId: claims.tenant_id, role: claims.role, expiresAt: claims.exp * 1000 };
        } catch {
            return null;
        }
    }
}
