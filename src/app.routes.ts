import { Routes } from '@angular/router';
import { AppLayout } from './app/layout/component/app.layout';
import { Dashboard } from './app/pages/dashboard/dashboard';
import { Notfound } from './app/pages/notfound/notfound';
import { authGuard } from './app/core/guards/auth.guard';
import { permissionGuard } from './app/core/guards/permission.guard';
import { secondFactorGuard } from './app/core/guards/second-factor.guard';

export const appRoutes: Routes = [
    {
        path: '',
        component: AppLayout,
        canActivate: [authGuard],
        // Quien debe activar el segundo factor y no lo ha hecho solo puede ir a la pantalla de seguridad (spec 022): se comprueba al entrar en CUALQUIER ruta hija.
        canActivateChild: [secondFactorGuard],
        children: [
            { path: '', component: Dashboard },
            {
                path: 'customers',
                canActivate: [permissionGuard('Customers.Read')],
                loadComponent: () => import('./app/features/customers/pages/customer-list/customer-list.component').then((c) => c.CustomerListComponent)
            },
            {
                path: 'customers/new',
                canActivate: [permissionGuard('Customers.Write')],
                loadComponent: () => import('./app/features/customers/pages/customer-form/customer-form.component').then((c) => c.CustomerFormComponent)
            },
            {
                path: 'customers/:id',
                canActivate: [permissionGuard('Customers.Write')],
                loadComponent: () => import('./app/features/customers/pages/customer-form/customer-form.component').then((c) => c.CustomerFormComponent)
            },
            {
                path: 'jobs',
                canActivate: [permissionGuard('Jobs.Read')],
                loadComponent: () => import('./app/features/jobs/pages/job-list/job-list.component').then((c) => c.JobListComponent)
            },
            {
                path: 'jobs/new',
                canActivate: [permissionGuard('Jobs.Write')],
                loadComponent: () => import('./app/features/jobs/pages/job-form/job-form.component').then((c) => c.JobFormComponent)
            },
            {
                path: 'jobs/:id',
                canActivate: [permissionGuard('Jobs.Write')],
                loadComponent: () => import('./app/features/jobs/pages/job-form/job-form.component').then((c) => c.JobFormComponent)
            },
            {
                path: 'agenda',
                canActivate: [permissionGuard('Jobs.Read')],
                loadComponent: () => import('./app/features/agenda/pages/agenda/agenda.component').then((c) => c.AgendaComponent)
            },
            {
                path: 'quotes',
                canActivate: [permissionGuard('Quotes.Read')],
                loadComponent: () => import('./app/features/quotes/pages/quote-list/quote-list.component').then((c) => c.QuoteListComponent)
            },
            {
                path: 'quotes/new',
                canActivate: [permissionGuard('Quotes.Write')],
                loadComponent: () => import('./app/features/quotes/pages/quote-form/quote-form.component').then((c) => c.QuoteFormComponent)
            },
            {
                // Quien solo puede leer entra en modo lectura: la pantalla se pone en solo lectura sin Quotes.Write o si el presupuesto ya no es un borrador.
                path: 'quotes/:id',
                canActivate: [permissionGuard('Quotes.Read')],
                loadComponent: () => import('./app/features/quotes/pages/quote-form/quote-form.component').then((c) => c.QuoteFormComponent)
            },
            {
                path: 'team',
                canActivate: [permissionGuard('Users.Read')],
                loadComponent: () => import('./app/features/team/pages/team/team.component').then((c) => c.TeamComponent)
            },
            {
                path: 'account/security',
                canActivate: [permissionGuard('Mfa.Manage')],
                loadComponent: () => import('./app/features/account/pages/security/security.component').then((c) => c.SecurityComponent)
            }
        ]
    },
    { path: 'notfound', component: Notfound },
    { path: 'auth', loadChildren: () => import('./app/pages/auth/auth.routes') },
    { path: '**', redirectTo: '/notfound' }
];
