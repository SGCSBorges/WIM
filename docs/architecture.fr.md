# Architecture de WIM

> 🇬🇧 English version: [`architecture.md`](./architecture.md) · 📚 Sommaire :
> [`README.md`](./README.md)

Une carte de la façon dont les pièces s'assemblent. C'est la vue « comment tout
circule » — le détail canonique vit ailleurs et est référencé ici :

- [`CLAUDE.md`](../CLAUDE.md) — conventions, particularités de déploiement, le
  modèle de partage et la facturation en profondeur (canonique en cas de
  désaccord avec ce document).
- [`docs/api.md`](./api.md) — le modèle d'authentification, le piège des pièces
  jointes et une section de triage des confusions courantes.
- [`docs/data-dictionary.md`](./data-dictionary.md) — la référence exhaustive
  champ par champ des 36 tables + 16 énumérations.
- [`docs/uml/`](./uml/) — diagrammes PlantUML (en français) : cas d'utilisation,
  modèle de classes, flux cœur et machines à états.

## Forme du monorepo

npm workspaces, trois paquets :

- **`apps/api`** — Node 22, Express + TypeScript, Prisma sur PostgreSQL, BullMQ
  sur Redis, Stripe, JWT dans un cookie httpOnly. Point d'entrée
  `src/index.ts` ; l'app est assemblée dans `src/app.ts`.
- **`apps/web`** — Vite + React 19 + React Router v8 + Tailwind. Installable en
  PWA. Point d'entrée `src/main.tsx` ; routes dans `src/App.tsx` ; le client
  API est `src/services/api.ts`.
- **`packages/types`** — interfaces partagées sans framework (ni Zod, ni Prisma,
  ni React) pour que les deux runtimes importent les mêmes formes de réponse.
  Les unions de chaînes partagées entre la journalisation de l'API et les menus
  déroulants web (`AUDIT_ACTIONS`, `ATTACHMENT_TYPES`, `INVITE_STATUSES`, …) y
  sont des tuples `as const` — la source unique de vérité.

## Cycle de vie d'une requête

Un appel authentifié typique depuis le web suit ce chemin (câblage dans
[`apps/api/src/app.ts`](../apps/api/src/app.ts)) :

1. **Le web** émet `fetch(url, { credentials: "include" })` pour que le cookie
   httpOnly `wim_token` accompagne l'appel (le client ne manipule jamais le
   jeton — `services/api.ts` s'en charge pour chaque appel).
2. **Middleware de sécurité** — `helmet`, CORS (contre `CORS_ORIGIN`) et le
   limiteur de débit global (`config/security.ts`).
3. **`csrfGuard`** — sur les méthodes mutantes (POST/PUT/PATCH/DELETE) qui
   portent le cookie, il exige un `Origin`/`Referer` de la liste blanche. Les
   navigateurs les attachent automatiquement ; un script cross-site ne peut pas
   les forger. Les méthodes sûres et les requêtes sans cookie sont ignorées.
4. **`authGuard`** — vérifie la signature du JWT → contrôle la liste de
   révocation Redis pour le `jti` du jeton (déconnexion/réinitialisation
   révoquent ici) → relit `tokenVersion` et `role` en base en un petit select.
   Incrémenter `tokenVersion` invalide tout jeton émis avant (déconnexion,
   réinitialisation de mot de passe, déconnexion forcée admin) ; un changement
   de rôle se propage immédiatement, sans reconnexion.
5. **Handler de route**, enveloppé dans `asyncHandler` pour qu'une erreur
   levée/rejetée atterrisse dans le handler global au lieu de bloquer la requête.
6. **`errorHandler`** — mappe `ZodError → 400`, Prisma `P2002 → 409`,
   `createHttpError(status,…)` vers son statut, les erreurs Multer vers 413, et
   tout le reste vers 500. Les réponses 5xx portent un `requestId` citable au
   support.

Le webhook Stripe est la seule exception : il est monté **avant**
`express.json()` (la vérification de signature a besoin du corps brut) et sort
donc du chemin cookie/CSRF — il s'authentifie par une signature HMAC.

Le cycle connexion → session → révocation est dessiné dans l'UML `09`.

## Flux de données cœur : article → garantie → rappel

C'est la colonne vertébrale du produit (voir l'activité UML `02` et la séquence
`04`) :

1. **Créer un article** (`POST /api/articles`). Emplacements et étiquettes sont
   attachés par id ; la propriété de chacun est vérifiée avant l'écriture de la
   clé étrangère.
2. **Garantie optionnelle**, soumise dans le même corps de requête. Le serveur
   calcule `garantieFin = garantieDateAchat + garantieDuration` mois — le client
   n'envoie jamais la date de fin.
3. **`AlertService` planifie les rappels** — J-30 / J-7 / J-1 avant
   `garantieFin` par défaut, ou les décalages personnalisés de l'utilisateur
   (`User.warrantyReminderDays`, modifiables dans Profil → Notifications),
   mis en file comme jobs BullMQ sur la file `wim-alerts` (les dates passées
   sont ignorées). Chaque ligne d'alerte épingle son propre décalage
   (`Alerte.reminderDays`) pour que l'annulation reconstruise l'id de job
   exact.
4. **Le processeur de rappels délivre** au déclenchement d'un job : charger le
   contexte → **push (attendu ; lève en cas d'échec dur pour que BullMQ
   réessaie)** → **e-mail (au mieux ; ne lève jamais)** → **marquer l'alerte
   `SENT`**. Cet ordre compte — un push échoué ne doit pas marquer l'alerte
   envoyée et perdre la notification. Les alertes personnalisées récurrentes
   replanifient l'occurrence suivante ici aussi.

Le push nécessite des clés VAPID et l'e-mail `RESEND_API_KEY` + `MAIL_FROM` ;
sans eux, chaque branche est un no-op journalisé et le reste du flux n'est pas
affecté.

## Cycle de vie des garanties (renouveler / prolonger / historique)

Comme `Garantie` impose du 1:1 avec un article (`garantieArticleId` unique), le
renouvellement **fait avancer la ligne vivante** au lieu d'insérer une sœur —
même `garantieId`, nouvelles dates. Le contrat précédent est capturé dans la
table en ajout seul `WarrantyHistory` (`event : RENEWED | EXTENDED | REPLACED`,
plus `priorDateAchat`, `priorDuration`, `priorFin`, note optionnelle).
Renouvellement et prolongation réutilisent tous deux
`AlertService.rescheduleForWarranty`, si bien que les rappels J-30/J-7/J-1
s'annulent et se redéclenchent contre la nouvelle date de fin sans code de
planification dupliqué. L'UML détail-article parcourt l'historique du plus
récent au plus ancien pour afficher une chaîne « renouvelé 2026 → 2028 →
2030 » ; le helper partagé `warrantyStatusFor` pilote le badge de statut et les
pilules de filtre pour que la liste d'articles, la vue Garanties, le filtre des
Rapports et le panneau « À surveiller » du tableau de bord s'accordent toujours
sur ce que signifie « expiré » ou « expire bientôt » (fenêtre de 30 jours
alignée sur le rappel J-30).

## Deux modèles de partage (+ foyers)

Les deux exigent la **capacité de partage** (POWER_USER, ou ADMIN qui en hérite
sans abonnement — `requireRole` s'appuie sur la hiérarchie
`USER < POWER_USER < ADMIN` dans `modules/common/roles.ts`). Le détail canonique
est dans la section « Sharing model » de [`CLAUDE.md`](../CLAUDE.md). Voir l'UML
`06` pour la séquence par utilisateur.

- **Public** — `Article.sharedWithPowerUsers` (un booléen). Toujours en lecture
  seule, visible par tous les POWER_USER. Coupe-circuit du propriétaire :
  `POST /api/articles/unshare-all`.
- **Par utilisateur** — un `InventoryShare` (`READ`|`WRITE`, drapeau `active`),
  créé en acceptant une `ShareInvite` par jeton (POWER_USER → POWER_USER, gardé
  aux deux bouts). Les destinataires WRITE éditent les champs de base via
  `PUT /api/shared/articles/:id`.

**Les foyers** se superposent au modèle par utilisateur : un `Household`
(max 6 membres, un foyer par utilisateur) est un **maillage auto-géré de
lignes `InventoryShare` en WRITE** — chaque paire de membres reçoit une ligne
dans les deux sens, marquée `viaHouseholdId`. Le maillage étant fait de
lignes de partage ordinaires, toutes les surfaces existantes (vues partagées,
éditions WRITE, visibilité des transferts PULL) fonctionnent sans changement
sur les inventaires du foyer. Rejoindre construit le maillage ;
quitter/retirer ne démonte que les lignes marquées. Voir la section
« Household accounts » de [`docs/api.md`](./api.md) pour les endpoints.

À chaque rétrogradation POWER_USER → USER (webhook d'annulation Stripe,
`/api/billing/sync` manuel, rétrogradation admin),
`ShareService.cleanupSharingForUser` fait sortir l'utilisateur de son foyer
(démontage du maillage + suppression de l'appartenance), repasse les articles
publics en privé, désactive les partages sortants et révoque les invitations
en attente — **dans la même transaction que le changement de rôle**. Le chemin
d'abonnement/désabonnement Stripe (gardes du webhook + repli `sync`) est dessiné
dans l'UML `10`.

## Transfert de propriété d'un article

Transfert permanent entre deux comptes capables de partage (POWER_USER ou
ADMIN), détaillé dans la section « Article ownership transfer » de
[`CLAUDE.md`](../CLAUDE.md). Deux flux :

- **PUSH** — le propriétaire envoie une offre à une adresse précise. Le
  destinataire accepte depuis sa page `/transfers`.
- **PULL** — un utilisateur capable de partage demande la propriété d'un article
  visible (partagé publiquement ou via un `InventoryShare` actif). Le
  propriétaire accepte ou refuse.

À l'acceptation, une seule transaction Prisma ré-attribue `Article`, `Garantie`,
`WarrantyHistory`, `Alerte`, `Attachment` et `ArticleNote` au nouveau
propriétaire, puis supprime `ArticleLocation` + `ArticleTag` (propres au
propriétaire — le nouveau les réaffecte depuis ses propres listes) ainsi que les
liens `Loan`, `ServiceRecord` et `ArticleInsurance` (personnels au cédant), et
révoque toutes les autres demandes de transfert PENDING du même article.

Cycle de statut : `PENDING → ACCEPTED | REJECTED | REVOKED | EXPIRED` (fenêtre de
7 jours). Une rétrogradation via annulation Stripe ou par un admin révoque en
plus toutes les demandes PENDING dont l'utilisateur rétrogradé est partie — le
même `ShareService.cleanupSharingForUser` s'en charge.

Actions d'audit : `ARTICLE_TRANSFER_INIT`, `ARTICLE_TRANSFER_ACCEPT`,
`ARTICLE_TRANSFER_REJECT`, `ARTICLE_TRANSFER_REVOKE`.

## Tâches de fond

Les workers tournent **dans le même processus** que l'API (économique sur le
free-tier Render). Deux files BullMQ :

- **`wim-alerts`** — rappels garantie/personnalisés sensibles à la latence (3
  tentatives, backoff exponentiel).
- **`wim-maintenance`** — balayages longs, sur trois horaires répétables (purge
  d'audit `0 3 * * *`, purge de corbeille `30 3 * * *`, digest hebdomadaire de
  garanties `0 9 * * 1`, tous en UTC), documentés dans
  [`docs/api.md`](./api.md#background-jobs) ; le câblage est dans
  [`jobs/workers.ts`](../apps/api/src/jobs/workers.ts).

La profondeur des files et les échecs récents apparaissent dans l'onglet
Admin → Jobs (`/admin/jobs`).

## Coque de l'app web & design system

Le client web repose sur un design system tokenisé avec des variables CSS
sensibles au thème (light / dark / ocean / cyber / sunset) reliées aux classes
utilitaires Tailwind via `apps/web/tailwind.config.js` — les primitives ne
codent donc pas les couleurs en dur et chaque route fonctionne sur les cinq
thèmes. Le thème actif pilote aussi une unique `<meta name="theme-color">` (pour
la barre du navigateur mobile et de la PWA installée), et `<html lang>` suit la
langue choisie pour la prononciation par les lecteurs d'écran.

- **Primitives** (`apps/web/src/components/ui/`) : `Button`, `Field` (+
  `Input`/`Textarea`/`Select`), `PageHeader`, `Tabs`, `ConfirmDialog`, `Badge`,
  `Card`/`Section`, `Stat`, `Pagination`, `Breadcrumbs`, `Segmented`, `Popover`,
  `Dropzone`, `CommandPalette`. Toutes accessibles (gestion du focus, ARIA,
  `prefers-reduced-motion`), tokenisées, importées via le baril `components/ui`.
- **Coque applicative** (`components/layout/`) : `Sidebar` persistante,
  `TopBar` collante (recherche/palette de commandes, `NotificationBell`, install
  PWA, langue/thème, profil, déconnexion, **bouton d'ajout rapide global**),
  `MobileDrawer` sur petits écrans, `BackToTop`. Routes/auth dans `App.tsx`.
- **Chrome de route** (`RouteChrome`, monté une fois dans `main.tsx`) :
  `<title>` par page, remontée en haut + focus sur `#main` à la navigation avant
  (le retour arrière préserve le défilement restauré), et une région `aria-live`
  polie qui annonce chaque nouvelle page.
- **Palette de commandes + raccourcis** : `mod+k` ouvre la palette partout ; `c`
  ouvre le formulaire de création ; `?` l'aide des raccourcis ; `g <touche>`
  saute à une section de nav.
- **Préférences** : les préférences multi-appareils
  (`theme`/`language`/`dateFormat`/`currency`) vivent sur la ligne `User`. La
  charge utile `/me` les transporte, hydratées avant le premier rendu. La
  `currency` vit aussi sur le provider `preferences`, si bien que les vues
  monétaires la lisent depuis le contexte au lieu de re-solliciter `/profile/me`.
  `localStorage` est le cache pré-auth. La `density` (`comfortable | compact`)
  est par appareil (cosmétique).

## Récapitulatif auth & sécurité

- **Cookie** — en production, le navigateur parle à une origine unique : le proxy
  `/api/*` de `render.yaml` sur le site statique relaie les appels côté serveur,
  ce qui garde la connexion fonctionnelle sur Safari/iOS (l'ITP jette les
  `Set-Cookie` cross-site). L'API pose tout de même `sameSite=none; secure` ;
  `lax` en dev.
- **Déconnexion forcée / révocation** — `tokenVersion` (par utilisateur, invalide
  tous les jetons) et la liste de révocation Redis par `jti` (par jeton, à la
  déconnexion).
- **Table de sessions** — `UserSession` : une ligne par appareil connecté, clé
  par le `jti` du JWT. `authGuard` fait une mise à jour au mieux de
  `lastActiveAt` (limitée à 1/min par jti). Révoquer une session met le jti en
  liste de révocation **et** estampille `revokedAt`.
- **TOTP 2FA** — opt-in (`User.totpEnabled`). Le chemin mot-de-passe-seul reste
  inchangé quand le drapeau est faux ; sinon `/auth/login` renvoie un
  `challengeToken` pré-auth court (5 min) au lieu d'un cookie, et le client poste
  le code à `/auth/login/verify-totp`. Les codes de secours sont hachés bcrypt et
  consommés à l'usage.
- **Passkeys (WebAuthn)** — un chemin de connexion alternatif
  (`/auth/webauthn/*`, une ligne `WebAuthnCredential` par authentificateur
  enrôlé). Le défi voyage dans un jeton signé de courte durée (même motif que
  le défi TOTP), et une assertion réussie ouvre une session complète **même
  pour les comptes TOTP** — possession + vérification utilisateur valent 2FA
  résistante au phishing. Les options pour un e-mail inconnu sont sûres contre
  l'énumération.
- **Pas d'énumération d'e-mails** — les recherches par e-mail renvoient la même
  erreur pour « introuvable » et « trouvé mais mauvais rôle ».

## Diagrammes

Les sources PlantUML sous [`docs/uml/`](./uml/) couvrent les cas d'utilisation,
le modèle de classes (entités + relations), les flux cœur d'ajout/rappel, la
séquence de partage, les machines à états réclamation-garantie et corbeille, une
vue composants/déploiement, le cycle de vie des alertes, la machine à états du
transfert de propriété (`11`) et les deux séquences critiques pour la sécurité —
authentification/session (`09`) et facturation Stripe (`10`). Elles sont écrites
en français ; chacune a une analyse écrite dans
[`docs/uml/README.md`](./uml/README.md), qui explique aussi comment les rendre
localement.
