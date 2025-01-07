# WIM — Warranty & Inventory Manager

**FR** · Application Web Progressive (**PWA**) pour gérer un inventaire personnel et recevoir des **rappels de garantie** avant expiration.  
**EN** · Progressive Web App to manage a personal inventory and receive **warranty reminders** before expiry.

---

## 🎯 Objectifs / Objectives

**FR**

- Centraliser les articles (biens), leurs **factures** (PDF/JPG) et leurs **garanties** (date d'achat, durée, fin).
- Envoyer des **notifications push** J-30 / J-7 / J-1 avant l'expiration.
- **Import/Export CSV** pour faciliter la saisie et la sauvegarde.
- **Partage d'inventaire** (option **Power User**).

**EN**

- Centralize items, **receipts** (PDF/JPG) and **warranties** (purchase date, duration, end).
- Send **push notifications** at D-30 / D-7 / D-1 before expiry.
- **CSV import/export** for easy onboarding and backup.
- **Inventory sharing** (paid **Power User** option).

---

## 🧱 Périmètre MVP / MVP Scope

- Item CRUD, Warranty with computed end date, Alerts scheduling (J-30/J-7/J-1)
- Attachments (invoice images/PDF)
- Web Push only (mobile-first), PWA offline shell
- CSV Import/Export
- Auth (email/password + JWT)
- Basic Admin (audit logs) & minimal stats

V2 (out of scope MVP): OCR factures, scan code-barres/QR, email/SMS, iOS packaging, dashboards avancés.

---

## 🗺️ Roadmap (high-level)

- **Phase 1 — Préparation & Cadrage (Jan 2025)**
  - README, structure repo, CI de base
- **Phase 2 — Analyse & Modélisation (Jan–Feb 2025)**
  - UML (use cases, activity, class, sequence, states), ERD & dictionnaire
- **Phase 3 — Backend (Feb–Apr 2025)**
  - API REST (Items/Warranties/Alerts), Auth JWT, BullMQ jobs, tests
- **Phase 4 — Frontend PWA (Apr–Jun 2025)**
  - React + Vite + Tailwind, PWA (manifest + SW), UI Inventaire, Push opt-in, Import/Export
- **Phase 5 — Intégration, Tests, Docs (Jun–Jul 2025)**
  - E2E Playwright, manuel utilisateur, mesures perf, sécurité (OWASP)
- **Phase 6 — Soutenance & Release (Jul–Aug 2025)**
  - Slides + démo, stabilisation, tag `v1.0.0-mvp`

---

## 🧰 Stack

- **Frontend**: React 18 + Vite + TypeScript, Tailwind, PWA (Service Worker)
- **Backend**: Node.js + Express/Nest style, TypeScript, **Prisma** + **PostgreSQL**
- **Jobs**: **BullMQ** + **Redis** (rappels)
- **Notifications**: Web Push (VAPID)
- **Qualité**: ESLint/Prettier, Jest/RTL, Playwright E2E, GitHub Actions

---

## 📦 Structure (prévue)
