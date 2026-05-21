# Contribuer au projet WIM

## Prérequis

- Node.js ≥ 22 (voir `.nvmrc`)
- PostgreSQL et Redis locaux (ou via `docker compose up -d db redis`)
- Copier les fichiers d'exemple :
  - `cp apps/api/.env.example apps/api/.env`
  - `cp apps/web/.env.example apps/web/.env`

## Branches

- `main` = branche stable, déployée. Aucune _push_ directe.
- `dev` = branche d'intégration. Toutes les contributions y sont _mergées_ avant de remonter sur `main`.
- Branches de travail (créées depuis `dev`) :
  - `feat/<domaine>-<description>` pour une nouvelle fonctionnalité
  - `fix/<issue>` pour une correction
  - `docs/<sujet>` pour la documentation
  - `chore/<sujet>` pour la maintenance

## Convention de commits

- `feat:` nouvelle fonctionnalité
- `fix:` correction de bug
- `docs:`, `chore:`, `refactor:`, `test:`, `perf:`, `ci:`, `style:`
- Exemple : `feat(api): ajout du calcul automatique de la date de fin de garantie`

## Pull Requests

- Cible : `dev` (sauf release vers `main`).
- Description claire : _ce qui est fait_ et _pourquoi_.
- Les vérifications CI doivent être vertes (build + tests + lint).
- Les tests doivent être ajoutés/ajustés si le comportement change.

## Tests

L'API a une suite Jest sous `apps/api/src/__tests__/`.

```bash
# Tous les workspaces qui ont un script test
npm test

# Uniquement l'API
npm test --workspace apps/api
```

## Style de code

- TypeScript en mode strict (les deux apps).
- ESLint + Prettier — exécutés en CI :

```bash
# Tous les workspaces
npm run lint
npm run fmt

# Un workspace en particulier
npm run lint --workspace apps/api
```

- Noms explicites, fonctions courtes, retours anticipés.
- Pas de `any` — utiliser `unknown` + narrowing si nécessaire.

## Issues

- Utiliser des labels : `bug`, `enhancement`, `docs`, `infra`, `security`.
