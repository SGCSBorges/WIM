# Contribuer au projet WIM

## Branches

- `main` = branche stable. Seuls les _merge requests_ validées y sont intégrées.
- Branches de développement :
  - `feat/<domaine>-<description>` pour une nouvelle fonctionnalité
  - `fix/<issue>` pour une correction
  - `docs/<sujet>` pour la documentation

## Convention de commits

- `feat:` nouvelle fonctionnalité
- `fix:` correction de bug
- `docs:`, `chore:`, `refactor:`, `test:`, `perf:`, `ci:`, `style:`
- Exemple : `feat(api): ajout du calcul automatique de la date de fin de garantie`

## Pull Requests

- Fournir une description claire (ce qui est fait et pourquoi).
- Les vérifications CI doivent être vertes (build + lint).
- Les tests doivent être ajoutés/ajustés si nécessaire.

## Style de code

- TypeScript en mode strict.
- ESLint + Prettier (à exécuter avant un push).
- Noms explicites, fonctions courtes, retours anticipés.

## Issues

- Utiliser des labels : `bug`, `enhancement`, `docs`, `infra`.
