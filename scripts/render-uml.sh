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
#
# PlantUML emits each SVG as one ~30 KB line, which GitHub's blob viewer
# refuses to render ("line too big to be shown"). We post-process each file to
# wrap it: a newline between adjacent tags, then break any still-long line at
# an existing space (never mid-token). Both edits only swap *insignificant*
# whitespace — inter-element whitespace and attribute-internal whitespace,
# which SVG renderers ignore (no xml:space="preserve" is emitted) — so the
# rendered image is unchanged and the transform is losslessly reversible. The
# wrap is deterministic, so the drift check still holds.
set -euo pipefail

# Wrap one rendered SVG in place: split between tags, then fold over-long
# lines at spaces. WRAP_COL is the soft limit; tokens are never split.
WRAP_COL=200
wrap_svg() {
  local f="$1"
  sed 's/></>\n</g' "$f" | awk -v lim="$WRAP_COL" '
    {
      out=""; col=0; n=length($0)
      for (i = 1; i <= n; i++) {
        c = substr($0, i, 1)
        if (c == " " && col >= lim) { out = out "\n"; col = 0 }
        else { out = out c; col++ }
      }
      print out
    }
  ' > "$f.tmp" && mv "$f.tmp" "$f"
}

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

echo "Wrapping long lines for GitHub blob rendering"
for f in "$UML_DIR"/*.svg; do
  wrap_svg "$f"
done

echo "Done. Generated:"
ls -1 "$UML_DIR"/*.svg
