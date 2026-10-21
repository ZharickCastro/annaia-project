# Cómo subir cambios al repositorio

Repositorio: https://github.com/ZharickCastro/annaia-project

## Primera vez en una máquina

1. Instalar GitHub CLI (`gh`) si no está instalado.
2. Iniciar sesión con la cuenta que tiene permiso de escritura en el repo:

   ```bash
   gh auth login --hostname github.com --git-protocol https --web
   ```

   Sigue las instrucciones: aparece un código y se abre el navegador para entrar con la cuenta de GitHub.

3. Verificar la cuenta activa:

   ```bash
   gh auth status
   ```

   Debe aparecer `Active account: true` en la cuenta correcta.

## Subir cambios con el script

Desde la carpeta del proyecto:

```bash
./scripts/subir.sh "Descripción corta de lo que cambió"
```

El script hace lo siguiente:

1. Revisa que haya cambios. Si no hay, termina sin hacer nada.
2. Agrega todos los archivos nuevos y modificados (respeta `.gitignore`).
3. Revisa que no estén archivos sensibles (`.env`, llaves `.pem`/`.key`, credenciales, `anna.db`). Si encuentra alguno, se detiene.
4. Muestra un resumen de lo que se va a subir.
5. Hace commit y push a la rama actual.

Si el script se detiene por archivos sensibles, quítalos del commit con `git reset HEAD <archivo>` y, si corresponde, agrégalos a `.gitignore`.

## Subir a mano (sin el script)

```bash
git status                       # ver qué cambió
git add <archivos>               # agregar solo lo que corresponde
git commit -m "Mensaje"          # crear el commit
git push origin main             # subir
```

## Qué no se sube

Está en `.gitignore`:

- `node_modules/`: dependencias. Se reinstalan con `npm install`.
- `dist/` y `.angular/`: archivos compilados.
- `anna.db*`: base de datos local con historial de preguntas.
- `.claude/`: configuración local de Claude Code.
- `*.log`: registros.

## Reglas del equipo

- No subir directo a `main` si el cambio es grande. Crear una rama, por ejemplo `git switch -c frontend-chat`, y pedir revisión antes de unirla.
- No hacer `git push --force` a `main`.
- Los mensajes de commit describen el porqué del cambio, en una o dos frases.
- Ningún archivo con contraseñas, tokens o datos de estudiantes.

## Si algo falla

- **`Permission to ... denied`**: la cuenta activa no tiene permiso en el repo. Revisa con `gh auth status` y cambia de cuenta con `gh auth switch`, o pide que te agreguen como colaborador.
- **`Updates were rejected`**: alguien subió cambios antes. Trae los cambios con `git pull --rebase origin main`, resuelve conflictos si aparecen y vuelve a subir.
- **`nothing to commit`**: no hay cambios. No es un error.
