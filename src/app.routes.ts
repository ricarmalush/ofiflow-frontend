import { Routes } from '@angular/router';
import { AppLayout } from './app/layout/component/app.layout';
import { Dashboard } from './app/pages/dashboard/dashboard';
import { Notfound } from './app/pages/notfound/notfound';
import { authGuard } from './app/core/guards/auth.guard';
import { permissionGuard } from './app/core/guards/permission.guard';

export const appRoutes: Routes = [
    {
        path: '',
        component: AppLayout,
        canActivate: [authGuard],
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
            }
        ]
    },
    { path: 'notfound', component: Notfound },
    { path: 'auth', loadChildren: () => import('./app/pages/auth/auth.routes') },
    { path: '**', redirectTo: '/notfound' }
];
