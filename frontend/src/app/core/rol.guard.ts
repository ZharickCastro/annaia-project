import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SesionService } from './sesion.service';

/** Sin sesión, cualquier vista interna redirige a /ingreso. */
export const sesionGuard: CanActivateFn = () =>
  inject(SesionService).haySesion() || inject(Router).createUrlTree(['/ingreso']);

/** El panel docente solo se abre con el rol Docente; un estudiante vuelve a /inicio. */
export const docenteGuard: CanActivateFn = () =>
  inject(SesionService).esDocente() || inject(Router).createUrlTree(['/inicio']);
