# annaia-project

Proyecto PIN4 implementado con Angular.

## Flujo de trabajo

- `master`: rama protegida. Solo recibe cambios mediante Pull Request aprobado por la propietaria del repositorio.
- `develop`: rama de integración.
- Ramas de trabajo: `feature/<nombre>` creadas desde `develop`.

1. `git checkout develop && git pull`
2. `git checkout -b feature/mi-cambio`
3. Commit y `git push -u origin feature/mi-cambio`
4. Abrir Pull Request hacia `develop`.
5. Cuando `develop` esté estable, se abre un PR `develop` → `master` para revisión y aprobación.
