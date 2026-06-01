#!/usr/bin/env bash
#
# Render every docs/uml/*.puml to a co-located *.svg via the pinned PlantUML
# Docker image (it bundles Graphviz, which the class/state/component/use-case
# diagrams need for layout). SVG is text, so the output is committed and shows
# inline on GitHub. CI re-runs this and fails on drift, so after editing a
# .puml you must regenerate: `npm run docs:uml` (then commit the .svg).
#
# The image tag is PINNED so local and CI produce byte-identical output — that
# is what makes the drift check reliable. We default to Google's Docker Hub
# mirror because the canonical `plantuml/plantuml` hub pulls are aggressively
# rate-limited for anonymous clients; override with PLANTUML_IMAGE if needed.
set -euo pipefail

IMG="${PLANTUML_IMAGE:-mirror.gcr.io/plantuml/plantuml:1.2025.4}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UML_DIR="$ROOT/docs/uml"

if ! docker info >/dev/null 2>&1; then
  echo "error: Docker daemon not reachable. This script renders via the" >&2
  echo "       $IMG image. Start Docker and retry." >&2
  exit 1
fi

echo "Rendering docs/uml/*.puml -> *.svg using $IMG"
# -nometadata drops the embedded source/version comment so output doesn't
# churn between PlantUML builds. --user keeps the generated files owned by the
# caller rather than root.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$UML_DIR:/data" \
  "$IMG" -tsvg -nometadata "/data/*.puml"

echo "Done. Generated:"
ls -1 "$UML_DIR"/*.svg
