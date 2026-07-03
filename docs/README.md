# WIM — Documentation index · Sommaire de la documentation

Central map of every documentation surface, in both English and French.
Carte centrale de toutes les ressources de documentation, en anglais et en
français.

---

## 📚 Guides & reference · Guides & référence

| Document | 🇬🇧 English | 🇫🇷 Français | Contenu |
|---|---|---|---|
| **Overview / README** | [`README.md`](../README.md) | [`README.fr.md`](../README.fr.md) | Présentation, stack, démarrage, rôles, référence API, déploiement, sécurité |
| **Architecture** | [`architecture.md`](./architecture.md) | [`architecture.fr.md`](./architecture.fr.md) | Cycle de vie d'une requête, flux article→garantie→rappel, partage, jobs |
| **API reference** | [`api.md`](./api.md) | — (voir Swagger) | Modèle d'auth, sections de triage, référence des routes |
| **Data dictionary · Dictionnaire de données** | [`data-dictionary.md`](./data-dictionary.md) | [`data-dictionary.fr.md`](./data-dictionary.fr.md) | Référence champ par champ des 36 tables + 15 énumérations |
| **Internal context · Contexte interne** | [`../CLAUDE.md`](../CLAUDE.md) | — | Conventions, particularités de déploiement, source canonique |
| **Contributing · Contribuer** | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | — | Flux de travail, tests, style |

> The **live Swagger UI** at `GET /api/docs` (raw spec at `GET /api/openapi.json`)
> is the language-neutral, canonical reference for exhaustive request/response
> shapes — generated from the same Zod schemas the API validates against.
>
> La **Swagger UI** (`GET /api/docs`) est la référence canonique et neutre en
> langue pour les formes exhaustives de requêtes/réponses — générée à partir des
> mêmes schémas Zod que ceux validés par l'API.

---

## 📐 UML diagrams · Diagrammes UML

The PlantUML models live in [`uml/`](./uml/) **(diagrams in French)**, each with
a written analysis and rendering instructions in
[`uml/README.md`](./uml/README.md). Versioned `.svg` renders sit beside each
`.puml` source and are kept in sync by the CI `uml` drift job.

Les modèles PlantUML sont dans [`uml/`](./uml/) **(diagrammes en français)**,
chacun accompagné d'une analyse écrite et des instructions de rendu dans
[`uml/README.md`](./uml/README.md). Les rendus `.svg` versionnés sont maintenus
à jour par le job CI `uml`.

| # | Diagramme | Type |
|---|---|---|
| 01 | [Cas d'utilisation](./uml/01-use-cases.puml) | Use case |
| 02 | [Flux applicatifs cœur](./uml/02-activity-core-flows.puml) | Activity |
| 03 | [Diagramme de classes](./uml/03-class-diagram.puml) | Class / ERD |
| 04 | [Ajout d'un article](./uml/04-sequence-add-item.puml) | Sequence |
| 05 | [Cycle de vie de l'inventaire](./uml/05-state-inventory.puml) | State |
| 06 | [Partage entre utilisateurs](./uml/06-sequence-partage.puml) | Sequence |
| 07 | [Composants & déploiement](./uml/07-component-deploiement.puml) | Component / deployment |
| 08 | [Cycle de vie d'une alerte](./uml/08-state-alerte.puml) | State |
| 09 | [Authentification & session](./uml/09-sequence-auth.puml) | Sequence |
| 10 | [Facturation Stripe](./uml/10-sequence-billing.puml) | Sequence |
| 11 | [Transfert de propriété](./uml/11-state-transfer.puml) | State |

---

## 🔁 How the docs stay accurate · Comment les docs restent exactes

Two CI gates prevent drift between code and documentation / Deux garde-fous CI
empêchent tout décalage entre le code et la documentation :

- **Prisma migration drift** — fails if `schema.prisma` is ahead of `migrations/`.
- **UML drift (`uml` job)** — re-renders every `.svg` from its `.puml` and fails
  on a stale committed render.
