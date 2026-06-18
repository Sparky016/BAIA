import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'input', pathMatch: 'full' },
  { path: 'input', loadComponent: () => import('./input/input.component').then(m => m.InputComponent) },
  { path: 'progress/:id', loadComponent: () => import('./progress/progress.component').then(m => m.ProgressComponent) },
  { path: 'review/:id', loadComponent: () => import('./review/review.component').then(m => m.ReviewComponent) },
];
