# Dictionnaire de données de WIM

> 🇬🇧 English version: [`data-dictionary.md`](./data-dictionary.md) · 📚 Sommaire :
> [`README.md`](./README.md)

Une référence au niveau des champs pour chaque table et énumération de la base.
C'est le **compagnon écrit** du diagramme visuel
[`docs/uml/03-class-diagram.puml`](./uml/03-class-diagram.svg) : le diagramme
montre les relations d'un coup d'œil, ce document est le catalogue exhaustif
colonne par colonne. Les deux sont alignés sur la source unique de vérité,
[`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) — en cas de
désaccord entre les trois, c'est le schéma qui l'emporte.

**Portée :** 36 modèles + 15 énumérations, regroupés par domaine : Inventaire
cœur · Modules de cycle de vie · Partage & transfert · Messagerie · Sécurité du
compte · Plateforme & admin · Énumérations.

## Conventions

Valables pour toutes les tables sauf mention contraire dans une ligne.

- **Clés primaires** : `Int` auto-incrémenté (`@id @default(autoincrement())`),
  sauf `ProcessedStripeEvent` (la chaîne `eventId` de Stripe est la PK) et les
  tables de jonction (PK composites).
- **Propriété.** Presque chaque ligne porte `ownerUserId` (FK → `User.userId`,
  `onDelete: Cascade`). Supprimer un utilisateur supprime tout son graphe. La
  colonne `Type` marque ces champs `FK→User`.
- **Nullabilité.** Un `?` dans le type signifie colonne nullable ; sinon elle est
  `NOT NULL`. Les valeurs par défaut figurent dans la colonne `Défaut`.
- **Horodatages.** La plupart des tables ont `createdAt` (`@default(now())`) et
  `updatedAt` (`@updatedAt`) ; ils sont omis des grilles et signalés seulement
  quand l'un manque ou est sémantiquement intéressant.
- **Monnaie** : `Decimal(12,2)` (`Decimal(5,2)` pour les pourcentages). Prisma
  sérialise `Decimal` en **chaîne** en JSON pour éviter la dérive des flottants —
  le client web l'analyse et le formate. Ne jamais supposer un `number` JS.
- **Noms français hérités** (`Garantie`, `Alerte*`, `articleNom`, `garantieFin`…)
  conservés volontairement pour éviter une migration coûteuse. Les unions
  partagées de [`@wim/types`](../packages/types) utilisent des noms anglais
  (`AlertStatus`, `AttachmentType`…) mais les **valeurs littérales sont
  identiques**, si bien qu'une valeur d'énumération Prisma correspond exactement à
  l'union typée.
- **Soft-delete** : seul `Article` en dispose (`deletedAt`) ; tout le reste est
  une suppression dure (souvent par cascade). Sessions et invitations utilisent
  un marqueur `revokedAt` / `status` plutôt qu'une suppression, pour conserver une
  trace d'audit.

---

## Inventaire cœur

### User

Le compte et le propriétaire de toute autre ligne. Porte aussi les préférences
multi-appareils et les identifiants de facturation Stripe.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `userId` | Int (PK) | auto | |
| `email` | String | — | **Unique**. Identité de connexion. |
| `password` | String | — | Hachage bcrypt. Jamais renvoyé par l'API. |
| `role` | `Role` | `USER` | USER / POWER_USER / ADMIN. Relu à chaque requête dans `authGuard`. |
| `tokenVersion` | Int | `0` | Incrémenté à la déconnexion forcée / au changement de mot de passe ou d'e-mail → invalide tous les JWT antérieurs. |
| `stripeCustomerId` | String? VarChar(80) | null | **Unique**. |
| `stripeSubscriptionId` | String? VarChar(80) | null | **Unique**. Posé à l'abonnement, effacé au désabonnement. |
| `currency` | String VarChar(3) | `"USD"` | Devise d'affichage ISO 4217. |
| `monthlyBudget` | Decimal(12,2)? | null | Budget de dépenses optionnel ; null = non défini. |
| `annualBudget` | Decimal(12,2)? | null | Budget de dépenses optionnel ; null = non défini. |
| `calendarToken` | String? VarChar(64) | null | **Unique**. Jeton de capacité du flux iCal ; null = flux désactivé. |
| `emailReminders` | Boolean | `true` | Désinscription des rappels de garantie par e-mail. |
| `weeklyDigest` | Boolean | `false` | Inscription au digest hebdomadaire des expirations. |
| `warrantyReminderDays` | String? VarChar(40) | null | CSV des décalages de rappel (ex. `"90,30,7"`) ; null = défaut J-30/J-7/J-1. |
| `emailVerifiedAt` | DateTime? | null | Posé à la consommation du lien de vérification ; remis à null au changement d'e-mail. Souple — rien n'en dépend durement. |
| `theme` | String? VarChar(16) | null | `light\|dark\|ocean\|cyber\|sunset` ; null = défaut appareil. |
| `language` | String? VarChar(8) | null | `en\|fr\|pt\|es\|nl` ; null = défaut appareil. |
| `dateFormat` | String? VarChar(16) | null | `system\|dd/MM/yyyy\|MM/dd/yyyy\|yyyy-MM-dd`. |
| `alertsSeenAt` | DateTime? | null | Repère haut pour le compteur « non vus » de la cloche. |
| `totpEnabled` | Boolean | `false` | Miroir rapide de `TotpSecret.verified` ; conditionne le flux de connexion. |

**Relations :** possède `Article`, `Garantie`, `Alerte`, `Location`, `Tag`,
`ArticleNote`, `SavedView`, `ArticleTemplate`, `Attachment`, `Loan`,
`InsurancePolicy`, `ServiceRecord`, `WishlistItem`, `UserSession`,
`PushSubscription`, `PasswordResetToken`, `EmailVerificationToken`,
`AuditLog` ; 0..1 `TotpSecret` ; 0..1 `HouseholdMember` ; participe des deux côtés à
`InventoryShare`/`ShareInvite`/`ArticleTransferRequest`/`MessageThread`/`Message`.

### Article

Un bien physique de l'inventaire. Le hub auquel tout le reste se rattache.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `articleId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `articleNom` | String VarChar(100) | — | Nom. Indexé par trigrammes pour la recherche par sous-chaîne. |
| `articleModele` | String VarChar(100) | — | Modèle. Indexé par trigrammes. |
| `articleDescription` | String? VarChar(255) | null | Indexé par trigrammes. |
| `productImageUrl` | String? VarChar(500) | null | URL d'image externe/propre. |
| `serialNumber` | String? VarChar(120) | null | Indexé par trigrammes ; intégré à la recherche `q`. |
| `brand` | String? VarChar(120) | null | Indexé par trigrammes. |
| `purchasedFrom` | String? VarChar(150) | null | Enseigne/magasin. Privé — ne traverse jamais la frontière de partage. |
| `orderRef` | String? VarChar(100) | null | Référence de commande/reçu. Privé, comme `purchasedFrom`. |
| `purchasePrice` | Decimal(12,2)? | null | Prix **unitaire**. Pilote la valeur d'inventaire + l'amortissement (valeur = prix × `quantity`). |
| `quantity` | Int | `1` | Unités représentées par cette ligne. Les valeurs multiplient prix × quantité ; les décomptes restent par ligne. |
| `isFavorite` | Boolean | `false` | Favori épinglé par le propriétaire pour un accès rapide ; filtrable (`?favorite=1`). Cosmétique. |
| `depreciationRate` | Decimal(5,2)? | null | % linéaire annuel, 0–100. null = pas d'amortissement. |
| `sharedWithPowerUsers` | Boolean | `false` | Drapeau de partage public (lecture seule). |
| `publicToken` | String? VarChar(64) | null | **Unique**. Page publique opt-in `/i/<token>` ; null = désactivée. |
| `status` | `ArticleStatus` | `ACTIVE` | État de cycle de vie ; organisationnel, ne masque jamais la ligne. |
| `category` | `ArticleCategory`? | null | Catégorie large optionnelle ; null = non catégorisé. |
| `lastVerifiedAt` | DateTime? | null | Horodatage de l'inventaire physique ; null = jamais vérifié. Pilote le filtre `verification=needed` (jamais ou >12 mois) + le rappel du tableau de bord. |
| `customFields` | Json? | null | `{ key, value }[]` défini par l'utilisateur (≤20 ; clé ≤40, valeur ≤500). Privé, comme `purchasedFrom`. |
| `deletedAt` | DateTime? | null | Soft-delete (corbeille). Les lectures vivantes filtrent `deletedAt: null`. |

**Relations :** 0..1 `Garantie` ; plusieurs `Attachment`, `Alerte`,
`ArticleNote`, `ArticleTransferRequest`, `MessageThread`, `Loan`,
`ServiceRecord` ; M:N vers `Location` (`ArticleLocation`), `Tag` (`ArticleTag`),
`InsurancePolicy` (`ArticleInsurance`). Toutes les lignes filles cascadent à la
suppression de l'article.

### Garantie

1:1 avec un article (`garantieArticleId` unique). Le renouvellement fait avancer
la ligne vivante et capture le contrat précédent dans `WarrantyHistory` ; il n'y
a jamais deux garanties par article.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `garantieId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `garantieArticleId` | Int? (FK→Article) | null | **Unique**. Cascade. |
| `garantieNom` | String VarChar(100) | — | Libellé. |
| `garantieDateAchat` | DateTime | — | Date d'achat. |
| `garantieDuration` | Int | — | Durée en **mois**. |
| `garantieFin` | DateTime | — | Calculée côté serveur = `dateAchat + duration` mois. |
| `garantieIsValide` | Boolean | `true` | |
| `garantieImageAttachmentId` | Int? | null | **Unique**. Image de preuve optionnelle ; `onDelete: SetNull`. |
| `claimStatus` | `ClaimStatus` | `NONE` | État du workflow de réclamation. |
| `claimNote` | String? VarChar(2000) | null | |
| `claimUpdatedAt` | DateTime? | null | |
| `providerName` | String? VarChar(120) | null | Affiché sur le PDF de réclamation. |
| `providerPhone` | String? VarChar(40) | null | |
| `providerUrl` | String? VarChar(2048) | null | |
| `renewedAt` | DateTime? | null | Estampillé au premier renouvellement/prolongation ; null = jamais renouvelé. |

**Relations :** plusieurs `Alerte` (les rappels J-30/J-7/J-1), plusieurs
`Attachment`, plusieurs `WarrantyHistory`.

### WarrantyHistory

Instantané en ajout seul de l'état d'une garantie **avant** chaque
renouvellement/prolongation.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `garantieId` | Int (FK→Garantie) | — | Cascade. |
| `ownerUserId` | Int | — | Dénormalisé pour l'index par propriétaire. |
| `event` | `WarrantyHistoryEvent` | — | RENEWED / EXTENDED / REPLACED. |
| `priorDateAchat` | DateTime | — | Date d'achat avant changement. |
| `priorDuration` | Int | — | Durée avant changement (mois). |
| `priorFin` | DateTime | — | Date de fin avant changement. |
| `note` | String? VarChar(500) | null | |

### Alerte

Un rappel de garantie planifié automatiquement ou une alerte personnalisée créée
par l'utilisateur. Au moins un de `alerteGarantieId` / `alerteArticleId` est posé.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `alerteId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `alerteNom` | String VarChar(100) | — | |
| `alerteDate` | DateTime | — | Moment de déclenchement. |
| `alerteDescription` | String? VarChar(255) | null | |
| `status` | `AlerteStatus` | `SCHEDULED` | |
| `kind` | `AlerteKind` | `WARRANTY` | WARRANTY (auto) vs CUSTOM (utilisateur). |
| `recurrenceMonths` | Int? | null | CUSTOM seulement : répéter tous les N mois ; null = ponctuel. |
| `reminderDays` | Int? | null | WARRANTY seulement : le décalage en jours de ce rappel, pour reconstruire l'id de job BullMQ exact à l'annulation. Null sur les lignes anciennes/CUSTOM. |
| `snoozedUntil` | DateTime? | null | Posé au report ; `alerteDate` suit. |
| `sentAt` | DateTime? | null | |
| `failedAt` | DateTime? | null | |
| `errorMessage` | String? VarChar(500) | null | Dernière erreur de livraison. |
| `errorStack` | String? Text | null | |
| `alerteGarantieId` | Int? (FK→Garantie) | null | Cascade. |
| `alerteArticleId` | Int? (FK→Article) | null | Cascade. |

**Contrainte :** unique `(alerteGarantieId, alerteDate)` pour qu'une garantie ne
planifie pas deux fois le même rappel J-N.

### Attachment

Un fichier (facture, preuve de garantie, photo) lié à un article et/ou une
garantie.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `attachmentId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `type` | `AttachmentType` | `INVOICE` | |
| `articleId` | Int? (FK→Article) | null | Cascade. |
| `garantieId` | Int? (FK→Garantie) | null | Cascade (relation `AttachmentGarantie`). |
| `fileName` | String VarChar(255) | — | |
| `mimeType` | String VarChar(100) | — | |
| `fileSize` | Int | — | Octets. |
| `fileUrl` | String VarChar(500) | — | Pointe vers `/uploads/<fichier>` (statique authentifié) ou une URL externe. |
| `thumbUrl` | String? VarChar(500) | null | Aperçu redimensionné pour les images ; null pour les PDF. |

> Aussi la cible de `Garantie.garantieImageAttachmentId` via la relation
> `GarantieImageAttachment` (l'image de preuve désignée d'une garantie).

### Location

Un lieu de rangement. Propre au propriétaire ; nom unique par propriétaire.
Optionnellement imbriqué (Maison → Garage → Boîte rouge) via une auto-relation ;
le service parcourt la chaîne des ancêtres pour bloquer les cycles.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `locationId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `name` | String VarChar(120) | — | **Unique par propriétaire** (`uq_location_owner_name`). |
| `description` | String? VarChar(255) | null | |
| `parentLocationId` | Int? (FK→Location) | null | Auto-relation ; **SetNull** à la suppression du parent (les enfants remontent à la racine). |

### ArticleLocation *(jonction)*

M:N entre `Article` et `Location`. PK composite `(articleId, locationId)`.

| Champ | Type | Notes |
|---|---|---|
| `articleId` | Int (FK→Article) | Cascade. |
| `locationId` | Int (FK→Location) | Cascade. |
| `assignedAt` | DateTime | `@default(now())`. |

### Tag

Une étiquette libre. Propre au propriétaire ; nom unique par propriétaire. A
`createdAt` mais pas `updatedAt`.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `tagId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `name` | String VarChar(40) | — | **Unique par propriétaire** (`uq_tag_owner_name`). |
| `color` | String? VarChar(9) | null | Couleur de badge optionnelle en `#RRGGBB` (validée côté API) ; null = ton neutre par défaut. Cosmétique. |

### ArticleTag *(jonction)*

M:N entre `Article` et `Tag`. PK composite `(articleId, tagId)`. Les deux FK
cascadent.

### ArticleNote

Une entrée de chronologie sur un article (journal d'entretien, événement de
réclamation, observation).

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `noteId` | Int (PK) | auto | |
| `articleId` | Int (FK→Article) | — | Cascade. |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `content` | String VarChar(2000) | — | |
| `kind` | `ArticleNoteKind` | `OTHER` | |

### SavedView

Un preset nommé de filtres de la page Articles. `createdAt` seulement.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `name` | String VarChar(60) | — | **Unique par propriétaire** (`uq_savedview_owner_name`). |
| `query` | String VarChar(500) | — | Chaîne de filtres, ex. `warranty=expired&priceMin=100`. |

### ArticleTemplate

Un point de départ réutilisable pour le formulaire de création. Stocke les
emplacements/étiquettes **par nom** dans la charge JSON (pas des id de FK) pour
survivre à un renommage/suppression.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `name` | String VarChar(120) | — | |
| `payload` | Json | `{}` | `{ brand?, category?, depreciationRate?, locationNames[], tagNames[] }`. |

---

## Modules de cycle de vie

Modules par article payants (POWER_USER par défaut). Chacun peut engendrer une
alerte de rappel `CUSTOM` via `reminderAlerteId` (annulée au retour/suppression).

### Loan

Un enregistrement de prêt. Tant qu'il est actif, le `status` de l'article est
`LOANED`.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `loanId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `articleId` | Int (FK→Article) | — | Cascade. |
| `borrowerName` | String VarChar(120) | — | |
| `borrowerEmail` | String? VarChar(180) | null | |
| `loanedAt` | DateTime | `now()` | |
| `dueAt` | DateTime? | null | Une date d'échéance planifie un rappel. |
| `returnedAt` | DateTime? | null | null = toujours prêté. |
| `note` | String? VarChar(500) | null | |
| `reminderAlerteId` | Int? | null | Le rappel d'échéance, qu'un retour peut annuler. |

### InsurancePolicy

Une police couvrant 0..plusieurs articles via `ArticleInsurance`.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `policyId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `provider` | String VarChar(150) | — | |
| `policyNumber` | String? VarChar(100) | null | |
| `premium` | Decimal(12,2)? | null | Prime récurrente. |
| `coverageAmount` | Decimal(12,2)? | null | Plafond de couverture total. |
| `renewalAt` | DateTime? | null | Planifie un rappel ; replanifié à l'édition. |
| `note` | String? VarChar(500) | null | |
| `reminderAlerteId` | Int? | null | Le rappel de renouvellement. |

### ArticleInsurance *(jonction)*

M:N entre `Article` et `InsurancePolicy`. PK composite `(articleId, policyId)`.
Les deux FK cascadent.

### ServiceRecord

Une entrée de journal d'entretien/maintenance en ajout seul. `createdAt`
seulement.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `serviceId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `articleId` | Int (FK→Article) | — | Cascade. |
| `performedAt` | DateTime | — | |
| `description` | String VarChar(300) | — | |
| `cost` | Decimal(12,2)? | null | |
| `provider` | String? VarChar(150) | null | |
| `nextDueAt` | DateTime? | null | Planifie un rappel « prochain entretien ». Dérivé de `performedAt` + `intervalMonths` s'il n'est pas fourni. |
| `intervalMonths` | Int? | null | Cadence récurrente (1–120) ; null = ponctuel. |
| `reminderAlerteId` | Int? | null | |

### WishlistItem

Un achat prévu. Le marquer acheté pose `purchasedAt` (conservé, barré dans
l'interface) au lieu de le supprimer.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `name` | String VarChar(120) | — | |
| `url` | String? VarChar(500) | null | Lien produit (http/https uniquement). |
| `targetPrice` | Decimal(12,2)? | null | Alimente l'indicateur d'adéquation au budget. |
| `note` | String? VarChar(500) | null | |
| `purchasedAt` | DateTime? | null | Non nul = acheté. |

---

## Partage & transfert

### InventoryShare

Un partage actif propriétaire→cible à l'échelle de l'inventaire (READ ou WRITE).

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `inventoryShareId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade (`SharesGiven`). |
| `targetUserId` | Int (FK→User) | — | Cascade (`SharesReceived`). |
| `permission` | `SharePermission` | `READ` | |
| `active` | Boolean | `true` | Désactivé (non supprimé) à la rétrogradation. |
| `viaHouseholdId` | Int? (FK→Household) | null | Posé quand la ligne est gérée par un maillage de foyer ; **SetNull** à la suppression du foyer. Rejoindre/quitter un foyer ne touche que les lignes marquées. |

**Contrainte :** unique `(ownerUserId, targetUserId)`.

### ShareInvite

Une invitation par jeton qui matérialise un `InventoryShare` à l'acceptation.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `shareInviteId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `email` | String VarChar(255) | — | Invité (apparié par e-mail — pas de FK). |
| `token` | String VarChar(128) | — | **Unique**. Le justificatif de capacité. |
| `status` | `InviteStatus` | `PENDING` | |
| `permission` | `SharePermission` | `READ` | |
| `expiresAt` | DateTime | — | |
| `usedAt` | DateTime? | null | |

**Index :** composé `(ownerUserId, email, status)` pour le contrôle des
doublons d'invitation.

### Household *(foyer)*

Un petit groupe (max 6) d'utilisateurs aptes au partage dont les inventaires
sont mutuellement visibles et modifiables — implémenté comme un maillage
auto-géré de lignes `InventoryShare` en WRITE marquées `viaHouseholdId`, si
bien que toutes les surfaces de partage existantes fonctionnent sans
changement.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `name` | String VarChar(120) | — | |
| `createdByUserId` | Int | — | Informatif — **pas de FK**, le foyer survit à la suppression du compte de son créateur tant qu'il reste des membres. |

### HouseholdMember *(membre du foyer)*

Ligne d'appartenance. Un utilisateur appartient à **au plus un** foyer
(`userId` unique — la base arbitre les adhésions concurrentes). Le départ du
dernier membre supprime le foyer ; le départ du OWNER promeut le membre le
plus ancien.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `householdId` | Int (FK→Household) | — | Cascade. |
| `userId` | Int (FK→User) | — | **Unique.** Cascade. |
| `role` | `HouseholdRole` | `MEMBER` | OWNER gère invitations et retraits. |

A `createdAt` seulement.

### HouseholdInvite *(invitation au foyer)*

Invitation par jeton à rejoindre un foyer. Miroir de `ShareInvite`
(consommation atomique à usage unique, expiration à 7 jours).

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `householdId` | Int (FK→Household) | — | Cascade. |
| `email` | String VarChar(255) | — | Invité (rapproché par e-mail — pas de FK). |
| `token` | String VarChar(128) | — | **Unique**. Le justificatif de capacité. |
| `status` | `InviteStatus` | `PENDING` | |
| `expiresAt` | DateTime | — | 7 jours. |
| `usedAt` | DateTime? | null | |

### ArticleTransferRequest

Une demande de transfert de propriété permanent pour un article. PUSH = le
propriétaire initie ; PULL = un demandeur capable de partage initie. La « seconde
partie » accepte.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `articleId` | Int (FK→Article) | — | Cascade. |
| `requesterId` | Int (FK→User) | — | Veut recevoir (`TransferRequests`). Cascade. |
| `ownerId` | Int (FK→User) | — | Propriétaire actuel (`TransferOffers`). Cascade. |
| `direction` | `TransferDirection` | — | PUSH / PULL. |
| `token` | String VarChar(128) | — | **Unique**. Envoyé par e-mail à la partie qui accepte. |
| `status` | String VarChar(20) | — | `PENDING\|ACCEPTED\|REJECTED\|REVOKED\|EXPIRED` (chaîne simple, pas une énumération). |
| `message` | String? VarChar(500) | null | |
| `expiresAt` | DateTime | — | Fenêtre de 7 jours. |
| `usedAt` | DateTime? | null | Estampillé à l'acceptation/refus/révocation/expiration. |

> `status` est un `VarChar(20)`, **pas** une énumération BD — validé dans la
> couche service.

---

## Messagerie

### MessageThread

Une conversation de négociation 1:1 épinglée à un article partagé. Exactement deux
participants : le propriétaire de l'article **à la création** (un instantané —
survit à un transfert ultérieur) et le demandeur intéressé.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `articleId` | Int (FK→Article) | — | Cascade. |
| `ownerUserId` | Int (FK→User) | — | Propriétaire instantané (`ThreadOwner`). Cascade. |
| `requesterId` | Int (FK→User) | — | `ThreadRequester`. Cascade. |
| `lastMessageAt` | DateTime | `now()` | Dénormalisé pour un tri d'inbox peu coûteux. |
| `ownerUnread` | Boolean | `false` | Drapeau non-lu par côté. |
| `requesterUnread` | Boolean | `false` | |

**Contrainte :** unique `(articleId, requesterId)` — un fil par paire.

### Message

Un message dans un fil : `TEXT` simple ou `OFFER` d'achat structuré.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `threadId` | Int (FK→MessageThread) | — | Cascade. |
| `senderUserId` | Int (FK→User) | — | Cascade (`MessageSender`). |
| `body` | String VarChar(2000) | — | |
| `kind` | `MessageKind` | `TEXT` | |
| `offerAmount` | Decimal(12,2)? | null | OFFER seulement. |
| `offerStatus` | `OfferStatus`? | null | OFFER seulement : PENDING/ACCEPTED/DECLINED/WITHDRAWN. |

A `createdAt` seulement.

---

## Sécurité du compte

### UserSession

Une ligne par connexion active. `jti` correspond à la revendication du JWT et à
la clé de la liste de révocation Redis, si bien que révoquer ici révoque le jeton
sur tout le réseau.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int (FK→User) | — | Cascade. |
| `jti` | String VarChar(64) | — | **Unique**. id du JWT + clé de révocation. |
| `deviceLabel` | String? VarChar(120) | null | |
| `ip` | String? VarChar(80) | null | |
| `userAgent` | String? VarChar(255) | null | |
| `lastActiveAt` | DateTime | `now()` | Mis à jour au mieux (limité à 1/min) par `authGuard`. |
| `revokedAt` | DateTime? | null | Révocation douce ; sort la ligne de la vue « actives ». |

### TotpSecret

Secret 2FA par utilisateur + codes de secours hachés. 1:1 avec `User`.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int (FK→User) | — | **Unique**. Cascade. |
| `secret` | String VarChar(64) | — | Secret TOTP base32. |
| `backupCodesHash` | String Text | — | Tableau JSON de codes à usage unique hachés bcrypt. |
| `verified` | Boolean | `false` | Passe à vrai quand un code confirme la configuration → incrémente `User.totpEnabled`. |

### PasswordResetToken

Un jeton de réinitialisation à durée de vie courte. Seul le hachage SHA-256 est
stocké.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int (FK→User) | — | Cascade. |
| `tokenHash` | String VarChar(64) | — | **Unique**. Hex SHA-256 ; le texte clair est envoyé par e-mail, jamais stocké. |
| `expiresAt` | DateTime | — | |
| `consumedAt` | DateTime? | null | Posé à l'usage. |

A `createdAt` seulement.

### WebAuthnCredential

Une passkey enregistrée. Un utilisateur peut en détenir plusieurs
(téléphone, portable, clé matérielle) ; le compteur de signature `counter`
sert à la détection de clonage et est mis à jour à chaque assertion réussie.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int (FK→User) | — | Cascade. |
| `credentialId` | String VarChar(512) | — | **Unique**. Id Base64URL présenté par le navigateur à la connexion. |
| `publicKey` | Bytes | — | Clé publique COSE de l'authentificateur. |
| `counter` | Int | `0` | Compteur de signature (détection de clonage). |
| `transports` | String? VarChar(120) | null | CSV (usb/nfc/ble/internal/hybrid) pour l'UX allowCredentials. |
| `deviceLabel` | String? VarChar(120) | null | Nom fourni par l'utilisateur. |
| `lastUsedAt` | DateTime? | null | Horodaté à chaque connexion réussie. |

A `createdAt` seulement.

### EmailVerificationToken

Preuve de possession de l'adresse e-mail. Miroir de `PasswordResetToken`
(hachage SHA-256 stocké, texte clair envoyé par e-mail, consommation atomique
à usage unique) avec une durée de vie plus longue de 3 jours. Sa consommation
pose `User.emailVerifiedAt`.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int (FK→User) | — | Cascade. |
| `tokenHash` | String VarChar(64) | — | **Unique**. Hex SHA-256. |
| `expiresAt` | DateTime | — | 3 jours. |
| `consumedAt` | DateTime? | null | Posé à l'usage. |

A `createdAt` seulement.

### PushSubscription

Un abonnement navigateur Web Push (VAPID).

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int (FK→User) | — | Cascade. |
| `endpoint` | String VarChar(500) | — | **Unique**. URL du service push. |
| `p256dh` | String VarChar(200) | — | Clé publique du client. |
| `auth` | String VarChar(100) | — | Secret d'authentification. |

A `createdAt` seulement.

---

## Plateforme & admin

### AuditLog

Un journal d'actions en ajout seul. `userId` est **`onDelete: SetNull`** (pas
cascade) — les lignes survivent à la suppression de l'acteur comme trace
anonymisée.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int? (FK→User) | null | **SetNull** à la suppression de l'utilisateur. |
| `action` | String VarChar(80) | — | ex. `LOGIN`, `CREATE`, `BILLING_UPGRADE`, `WARRANTY_RENEW` (l'union `AUDIT_ACTIONS`). |
| `entity` | String VarChar(80) | — | ex. `User`, `Article`. |
| `entityId` | Int? | null | |
| `ip` | String? VarChar(80) | null | |
| `userAgent` | String? VarChar(255) | null | |
| `method` | String? VarChar(20) | null | Méthode HTTP. |
| `path` | String? VarChar(255) | null | |
| `status` | Int? | null | Statut HTTP. |
| `metadata` | Json | `{}` | Données supplémentaires propres à l'action. |

A `createdAt` seulement. Indexé sur `(userId, createdAt desc)` pour la vue admin
« utilisateur X, N derniers jours ».

### FeatureFlag

Une surcharge admin du rôle requis d'une fonctionnalité. Ligne absente = défaut
codé.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `featureKey` | String VarChar(60) | — | **Unique**. ex. `sharing`, `reports`, `analytics`. |
| `requiredRole` | `Role` | `USER` | Rôle minimal ; POWER_USER = le paywall. |

A `updatedAt` seulement (pas de `createdAt`).

### FeatureTempGrant

Une fenêtre temporelle laissant les comptes USER utiliser une fonctionnalité
normalement gardée à POWER_USER. Tout octroi actif couvrant la clé lève l'accès
jusqu'à `expiresAt`.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `featureKey` | String VarChar(60) | — | Non unique — plusieurs octrois peuvent coexister. |
| `expiresAt` | DateTime | — | Revérifié contre `now()` à la lecture. |
| `note` | String? VarChar(255) | null | |

A `createdAt` seulement. **Pas de `ownerUserId`** — les octrois sont globaux par
fonctionnalité, pas par utilisateur.

### ProcessedStripeEvent

Le marqueur d'idempotence du webhook. Survit aux redémarrages.

| Champ | Type | Défaut | Notes |
|---|---|---|---|
| `eventId` | String VarChar(255) (PK) | — | L'id d'événement Stripe **est** la PK. |
| `type` | String VarChar(100) | — | Type d'événement. |
| `processedAt` | DateTime | `now()` | |

**Pas de `ownerUserId`** — c'est une table de plateforme autonome.

---

## Énumérations

La plupart de ces énumérations sont reflétées par une union `as const` dans
[`@wim/types`](../packages/types/src/index.ts) — noms anglais (ex.
`AlertStatus`/`AlertKind` sans le « e » français), valeurs littérales identiques
— pour que l'API et le web partagent une source de vérité. **Exceptions :**
`MessageKind` et `OfferStatus` ne sont *pas* dans `@wim/types` ; ils sont typés
en ligne comme unions de littéraux dans
[`apps/web/src/services/api.ts`](../apps/web/src/services/api.ts) et le service de
messagerie. Les valeurs littérales correspondent toujours à l'énumération BD.

| Énumération | Valeurs | Utilisée par |
|---|---|---|
| `Role` | `USER` · `POWER_USER` · `ADMIN` | `User.role`, `FeatureFlag.requiredRole`. Hiérarchie `USER < POWER_USER < ADMIN`. |
| `SharePermission` | `READ` · `WRITE` | `InventoryShare`, `ShareInvite`. |
| `InviteStatus` | `PENDING` · `ACCEPTED` · `REVOKED` · `EXPIRED` | `ShareInvite.status`, `HouseholdInvite.status`. |
| `HouseholdRole` | `OWNER` · `MEMBER` | `HouseholdMember.role`. |
| `AttachmentType` | `INVOICE` · `WARRANTY` · `OTHER` | `Attachment.type`. |
| `AlerteStatus` | `SCHEDULED` · `SENT` · `CANCELLED` · `FAILED` | `Alerte.status`. |
| `AlerteKind` | `WARRANTY` · `CUSTOM` | `Alerte.kind`. |
| `ClaimStatus` | `NONE` · `OPEN` · `APPROVED` · `REJECTED` · `RESOLVED` | `Garantie.claimStatus`. |
| `ArticleNoteKind` | `SERVICE` · `WARRANTY_CLAIM` · `MAINTENANCE` · `OTHER` | `ArticleNote.kind`. |
| `ArticleStatus` | `ACTIVE` · `IN_REPAIR` · `LOANED` · `SOLD` · `DISPOSED` · `LOST` | `Article.status`. `SOLD/DISPOSED/LOST` sont exclus des totaux de valeur. |
| `ArticleCategory` | `ELECTRONICS` · `APPLIANCE` · `FURNITURE` · `TOOL` · `VEHICLE` · `CLOTHING` · `JEWELRY` · `SPORTS` · `COLLECTIBLE` · `OTHER` | `Article.category` (nullable). |
| `TransferDirection` | `PUSH` · `PULL` | `ArticleTransferRequest.direction`. |
| `MessageKind` | `TEXT` · `OFFER` | `Message.kind`. |
| `OfferStatus` | `PENDING` · `ACCEPTED` · `DECLINED` · `WITHDRAWN` | `Message.offerStatus` (messages OFFER uniquement). |
| `WarrantyHistoryEvent` | `RENEWED` · `EXTENDED` · `REPLACED` | `WarrantyHistory.event`. |

> Note : `ArticleTransferRequest.status` est un `VarChar(20)`, **pas** une
> énumération BD, bien qu'il porte les cinq mêmes valeurs
> (`PENDING/ACCEPTED/REJECTED/REVOKED/EXPIRED`). Il est validé dans la couche
> service.
