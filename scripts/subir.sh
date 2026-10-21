#!/usr/bin/env bash
# Uso: ./scripts/subir.sh "mensaje del commit"
# Agrega los cambios, revisa que no haya archivos sensibles, hace commit y push a la rama actual.
set -euo pipefail

if [ $# -lt 1 ] || [ -z "$1" ]; then
  echo "Falta el mensaje del commit. Ejemplo: ./scripts/subir.sh \"Corrige la búsqueda de títulos\"" >&2
  exit 1
fi

MENSAJE="$1"
RAMA="$(git rev-parse --abbrev-ref HEAD)"

if [ -z "$(git status --porcelain)" ]; then
  echo "No hay cambios para subir."
  exit 0
fi

git add -A

SENSIBLES="$(git diff --cached --name-only | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|\.p12$|credentials|secret|anna\.db' || true)"
if [ -n "$SENSIBLES" ]; then
  echo "Hay archivos que no deberían subirse:" >&2
  echo "$SENSIBLES" >&2
  echo "Quítalos con: git reset HEAD <archivo>  (y agrégalos a .gitignore si aplica)" >&2
  exit 1
fi

echo "Cambios que se van a subir a la rama '$RAMA':"
git diff --cached --stat
echo

git commit -m "$MENSAJE

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"

git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin "$RAMA"
echo "Listo: rama '$RAMA' subida."
