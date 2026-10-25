import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AppMenuitem } from './app.menuitem';
import { CurrentSessionService } from '../../core/services/current-session';
import { Permission } from '../../shared/models/permission.model';

@Component({
    selector: 'app-menu',
    standalone: true,
    imports: [CommonModule, AppMenuitem, RouterModule],
    template: `<ul class="layout-menu">
        @for (item of model(); track item.label) {
            @if (!item.separator) {
                <li app-menuitem [item]="item" [root]="true"></li>
            } @else {
                <li class="menu-separator"></li>
            }
        }
    </ul> `,
})
export class AppMenu {
    private session = inject(CurrentSessionService);

    // Se recalcula solo al cambiar el rol (entrar con otra cuenta). Cada entrada aparece si el rol
    // tiene el permiso de lectura de su pantalla; las secciones vacías no se muestran.
    readonly model = computed<MenuItem[]>(() => {
        const can = (permission: Permission) => this.session.can(permission);
        const sections: MenuItem[] = [
            {
                label: 'Inicio',
                items: [{ label: 'Dashboard', icon: 'pi pi-fw pi-home', routerLink: ['/'] }]
            },
            {
                label: 'Gestión',
                items: [
                    ...(can('Customers.Read') ? [{ label: 'Clientes', icon: 'pi pi-fw pi-users', routerLink: ['/customers'] }] : []),
                    ...(can('Jobs.Read') ? [{ label: 'Trabajos', icon: 'pi pi-fw pi-briefcase', routerLink: ['/jobs'] }] : [])
                ]
            },
            {
                label: 'Administración',
                items: [...(can('Users.Read') ? [{ label: 'Equipo', icon: 'pi pi-fw pi-id-card', routerLink: ['/team'] }] : [])]
            }
        ];
        return sections.filter((section) => section.items?.length);
    });
}
