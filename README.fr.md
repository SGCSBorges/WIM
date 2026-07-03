# WIM — Gestionnaire de garanties et d'inventaire

> 🇬🇧 English version: [`README.md`](./README.md) · 📚 Sommaire de la
> documentation : [`docs/README.md`](./docs/README.md)

WIM est une application SaaS full-stack de suivi des biens physiques, de leurs
garanties, de leurs pièces jointes et de leurs alertes. Elle repose sur un
frontend React et une API Node.js/Express appuyée sur PostgreSQL et Redis.

> **Nouveau sur le projet ?** Lisez [`CLAUDE.md`](./CLAUDE.md) à la racine — il
> contient le contexte interne (particularités de déploiement, conventions,
> points ouverts) que le README ne répète pas volontairement.
>
> **Comment tout s'articule ?** [`docs/architecture.fr.md`](./docs/architecture.fr.md)
> décrit le cycle de vie d'une requête, le flux article→garantie→rappel, les
> deux modèles de partage et le pipeline de tâches de fond.

---

## Pile technique

| Couche | Technologie |
|---|---|
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS · React Router v7 · react-hook-form + Zod |
| Backend | Node.js 22 · Express · TypeScript · Prisma ORM |
| Base de données | PostgreSQL |
| File d'attente | BullMQ + Redis |
| Authentification | JWT dans un cookie `httpOnly` (`wim_token`) + liste de révocation Redis à la déconnexion + `tokenVersion` par utilisateur pour la déconnexion forcée |
| Paiements | Stripe (abonnements + webhooks) |
| PWA | manifeste + service worker + icônes générées par sharp |
| Journalisation | journalisation structurée Pino |

---

## Structure du monorepo

```
WIM/
├── apps/
│   ├── api/                # API REST Express (port 3000)
│   └── web/                # SPA React + PWA (port 5173)
├── packages/
│   └── types/              # Interfaces TS partagées entre api + web
├── render.yaml             # Blueprint Render pour le site statique
├── CLAUDE.md               # Contexte de départ pour les nouveaux échanges
└── .github/workflows/ci.yml
```

npm workspaces, trois paquets. `packages/types` est neutre en framework (ni Zod,
ni Prisma, ni React) afin que les deux runtimes importent les mêmes formes de
réponse ; les unions de chaînes partagées (`AUDIT_ACTIONS`, `INVITE_STATUSES`, …)
y sont des tuples `as const` — la source unique de vérité.

---

## Démarrage

### Prérequis

- Node.js ≥ 22
- PostgreSQL
- Redis (pour BullMQ)

### Installation et lancement

```bash
npm install --workspaces
cp apps/api/.env.example apps/api/.env  # renseigner les valeurs (voir tableau ci-dessous)
npm --workspace apps/api run prisma:migrate
npm --workspace apps/api run dev        # API sur :3000
npm --workspace apps/web run dev        # Web sur :5173 (génère les icônes PWA au predev)
```

Définissez `VITE_API_BASE_URL=http://localhost:3000/api` dans
`apps/web/.env.local` pour que le web trouve l'API locale.

### Variables d'environnement requises (API)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL |
| `JWT_SECRET` | Secret de signature (≥ 32 caractères, aléatoire). L'app s'arrête au démarrage s'il manque. |
| `REDIS_URL` | `redis://hôte:port` — liste de révocation JWT + BullMQ |
| `CORS_ORIGIN` | Origine web autorisée, sans slash final. Liste séparée par virgules acceptée. |
| `APP_URL` | Origine web publique pour les URL de redirection Stripe. **Origine unique**, sans slash final. |

### Variables optionnelles (API)

| Variable | Description |
|---|---|
| `PORT` | Port de l'API (défaut `3000`) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Facturation Stripe |
| `STRIPE_POWER_USER_PRICE_MONTHLY` / `_YEARLY` | ID de prix `price_…` de l'abonnement POWER_USER |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | Fenêtre et plafond de limitation de débit (défauts `60000` / `100`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push (sinon, les envois push sont des no-op journalisés) |
| `RESEND_API_KEY` / `MAIL_FROM` | E-mails de rappel via Resend (sinon no-op) |

---

## Rôles utilisateurs

| Rôle | Capacités |
|---|---|
| `USER` | Gérer ses propres articles, garanties, pièces jointes, alertes |
| `POWER_USER` | Tout ce que fait USER, plus : partager des articles publiquement (lecture seule) avec tous les Power Users, inviter d'autres Power Users à lire ou écrire tout son inventaire, éditer les articles où il a un accès WRITE, transférer la propriété d'un article vers/depuis un autre Power User |
| `ADMIN` | Tout ce que fait POWER_USER (partage et transferts, sans abonnement), plus : gestion des utilisateurs, journal d'audit, déconnexion forcée, réinitialisation de mot de passe pour n'importe qui |

L'inscription publique crée toujours un `USER`. La hiérarchie
`USER < POWER_USER < ADMIN` (dans `modules/common/roles.ts`) fait qu'un ADMIN
franchit tout garde `requireRole("POWER_USER")` — il hérite du partage et des
transferts sans abonnement.

Pour créer le premier admin :

```bash
# En local
npm --workspace apps/api run promote:admin -- vous@exemple.com
# Sur le shell du service API Render
node dist/scripts/promote-to-admin.js vous@exemple.com
```

Sur le free-tier Render (Postgres expire chaque mois), un endpoint temporaire
`POST /api/auth/bootstrap-admin` + un bouton `TestAdmin` sur l'écran de connexion
promeut `admin@admin.com` en une fois **uniquement s'il n'existe aucun ADMIN**
(idempotent).

---

## Référence API

Chemin de base : `/api`. L'authentification passe par le cookie `httpOnly`
`wim_token` posé à la connexion — les clients doivent utiliser
`credentials: 'include'` (aucun en-tête `Authorization`).

> **Référence canonique** : la **Swagger UI** en ligne (`GET /api/docs`, spec
> brute `GET /api/openapi.json`) est construite à partir des mêmes schémas Zod
> que ceux validés par l'API — c'est la référence exhaustive et neutre en langue
> pour les formes de requêtes/réponses et les paramètres de requête. Voir aussi
> [`docs/api.md`](./docs/api.md) pour le modèle d'authentification et le triage.

Cartographie des groupes de ressources (détail exhaustif dans Swagger) :

| Groupe | Base | Résumé |
|---|---|---|
| **Auth** | `/api/auth` | inscription, connexion (+ défi TOTP), déconnexion, `/me`, mot de passe oublié/réinitialisé, vérification d'e-mail |
| **Articles** | `/api/articles` | CRUD, corbeille (soft-delete), duplication, import/export CSV/PDF, notes, opérations groupées, partage, transfert |
| **Garanties** | `/api/warranties` | CRUD, réclamation, renouvellement/prolongation en place + historique |
| **Pièces jointes** | `/api/attachments` | upload (10 Mo, validation magic-byte), liste, suppression |
| **Alertes** | `/api/alerts` | rappels garantie J-30/J-7/J-1 (décalages personnalisables) + alertes personnalisées récurrentes |
| **Emplacements / Étiquettes** | `/api/locations`, `/api/tags` | CRUD (emplacements imbriqués), affectation, fusion d'étiquettes |
| **Vues enregistrées** | `/api/saved-views` | presets de filtres d'articles |
| **Calendrier** | `/api/calendar` | flux iCal (RFC-5545) authentifié par jeton |
| **Push** | `/api/push` | abonnements Web Push (VAPID) |
| **Partage** | `/api/shares`, `/api/shared` | invitations par utilisateur (READ/WRITE) + vue reçue |
| **Foyer** | `/api/household` | groupe familial (max 6) — maillage auto-géré de partages WRITE entre membres |
| **Liste d'envies** | `/api/wishlist` | achats prévus avec indicateur d'adéquation au budget |
| **Statistiques** | `/api/statistics` | tableau de bord, analytique de dépenses, budget |
| **Transferts** | `/api/articles/transfers` | transfert de propriété PUSH/PULL entre Power Users |
| **Prêts / Assurances / Maintenance** | `/api/loans`, `/api/insurance`, `/api/service-records` | modules par article (payants) |
| **Page publique** | `/api/public`, `.../public-link` | page en lecture seule opt-in (cible d'étiquette QR) + signalement « objet trouvé » pour les objets perdus |
| **Profil** | `/api/profile` | e-mail, mot de passe, devise, préférences, décalages de rappel, sessions, TOTP, budget, export complet des données, suppression de compte |
| **Facturation** | `/api/billing` | checkout Stripe, portail, webhook, sync |
| **Admin** | `/api/admin` | utilisateurs, journal d'audit, drapeaux de fonctionnalités, jobs, export/import BD |
| **Fonctionnalités** | `/api/features` | carte d'accès `{ clé: booléen }` du demandeur |

### Découpage des fonctionnalités (feature gating)

Les admins contrôlent quel **rôle** chaque fonctionnalité nommée exige, en
surchargeant des valeurs par défaut codées. **POWER_USER est le paywall** :
verrouiller à POWER_USER signifie « payant » ; ADMIN hérite de tout via la
hiérarchie. Par défaut, toutes les fonctionnalités **sauf `cmd_palette`**
(USER — la recherche globale est ouverte à tous) exigent POWER_USER ; un admin
peut abaisser un curseur à USER, ou relever n'importe lequel à ADMIN. Les
**octrois temporaires** (temp grants) permettent à un USER d'essayer une
fonctionnalité POWER_USER jusqu'à une date d'expiration. Côté serveur,
`requireFeature(clé)` garde chaque route (refus → **403**) ; un cache-instantané
de 60 s alimente à la fois le garde et la carte d'accès via un même helper
`isAllowed`, si bien qu'ils ne peuvent jamais diverger.

---

## Modèle de données

```
User ─── Article ─── Garantie ─── WarrantyHistory (audit en ajout seul)
  │         │              └── Alerte
  │         ├── Attachment
  │         ├── ArticleNote (kind : SERVICE/WARRANTY_CLAIM/MAINTENANCE/OTHER)
  │         ├── Tag (M:N via ArticleTag)
  │         └── Location (M:N via ArticleLocation)
  │
  ├── ArticleTransferRequest (PUSH/PULL ; PENDING/ACCEPTED/REJECTED/REVOKED/EXPIRED)
  ├── ArticleTemplate · InventoryShare · ShareInvite
  ├── HouseholdMember → Household (max 6 ; maillage de partages WRITE) ── HouseholdInvite
  ├── WishlistItem · EmailVerificationToken
  ├── UserSession · TotpSecret · PasswordResetToken
  ├── SavedView · CalendarToken
  └── AuditLog
```

Cette vue est une colonne vertébrale simplifiée — pour la **référence
exhaustive champ par champ** de chaque table et énumération, voir
[`docs/data-dictionary.md`](./docs/data-dictionary.md) ; pour la circulation des
données, [`docs/architecture.fr.md`](./docs/architecture.fr.md) ; et pour le
diagramme de classes, [`docs/uml/`](./docs/uml/).

---

## Tests

```bash
npm test                                    # tous les workspaces
npm --workspace apps/api run test:watch     # mode veille
npm --workspace apps/api run test:coverage  # couverture
```

Les tests API sont dans `apps/api/src/__tests__/`, les tests web dans
`apps/web/src/__tests__/`. Les deux utilisent [Vitest](https://vitest.dev/). Pour
les trois paliers de tests (unitaire / intégration / e2e), voir la section
Testing de [`CONTRIBUTING.md`](./CONTRIBUTING.md#testing).

---

## Intégration continue (CI)

GitHub Actions (`.github/workflows/ci.yml`) s'exécute à chaque push sur
`main`/`dev` et sur chaque pull request. Le job **`build`** installe avec
`npm ci --include=optional`, lint + vérification de format prettier, génère le
client Prisma et compile l'API (`tsc`), **typecheck web**, **vérification de
dérive des migrations Prisma**, tests unitaires + couverture, tests
d'intégration (Postgres), tests + build web, puis
`npm audit --omit=dev --audit-level=moderate`. Le job **`uml`** re-rend les SVG
et échoue si un rendu versionné est périmé.

---

## Déploiement (Render)

Deux services sur Render, déployés depuis `dev` :

| Service | URL | Type |
|---|---|---|
| API | `https://wimapi.onrender.com` | Web service (`render-build:api`) |
| Web | `https://wim-web.onrender.com` | Site statique (via le Blueprint `render.yaml`) |

Variables d'env API : dans le tableau Render (**pas dans le dépôt**), toutes les
variables requises ci-dessus, plus `NODE_ENV=production`. Côté web, laisser
`VITE_API_BASE_URL` **vide** : la réécriture `/api/*` de `render.yaml` fait
transiter les appels navigateur par `wim-web.onrender.com` vers l'API, gardant le
navigateur sur une origine unique (indispensable pour la connexion Safari/iOS —
l'ITP bloque les `Set-Cookie` cross-site).

> **Particularités du free-tier :** Postgres expire après ~30 jours (re-seed
> admin via le bouton `TestAdmin`) ; le conteneur API démarre à froid en ~30 s
> (timeout web à 45 s) ; les uploads sont sur disque éphémère (passer à S3/R2 en
> production réelle).

---

## Notes de sécurité

- JWT en cookie `httpOnly` (`wim_token`), `sameSite=none` en production (web et
  api sur des sous-domaines Render différents, donc des sites PSL distincts),
  `lax` en dev, `secure` forcé en production.
- Chaque requête relit `tokenVersion` + `role` en base dans `authGuard` — un
  incrément de version invalide tous les JWT de l'utilisateur, et un changement
  de rôle se propage sans reconnexion.
- **CSRF** : le cookie étant `sameSite=none`, CORS seul ne suffit pas ;
  `csrfGuard` exige que l'`Origin`/`Referer` de toute requête mutante
  authentifiée par cookie figure dans la liste blanche.
- Limitation de débit globale (100 req/min par défaut) + buckets plus stricts
  pour l'auth, les opérations destructrices et la création de ressources.
- Uploads plafonnés (10 Mo) et validés par magic-byte avant conservation.
- Le webhook Stripe vérifie les signatures et utilise `ProcessedStripeEvent`
  pour l'idempotence.
- **Épinglages de dépendances** : le bloc `overrides` force les dépendances
  transitives vers des versions corrigées ; `npm audit --omit=dev` doit
  rapporter **0 vulnérabilité**.

---

## Limitations connues / feuille de route

- [ ] Déplacer les uploads du disque éphémère vers un stockage S3-compatible (R2/S3)
- [ ] Ajouter une limitation de débit par utilisateur/route en plus de la globale
- [ ] Étendre la couverture aux tests d'intégration au niveau des routes
- [ ] Ajouter une couche de cache de données (TanStack Query) côté web
- [ ] Remplacer le `/auth/bootstrap-admin` temporaire par un vrai flux de seed
- [ ] Consolider les deux modèles de partage en une seule boîte de dialogue
