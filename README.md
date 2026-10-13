# PointageRH Tunisie — Application de Pointage & Gestion de Présence

Application web complète de pointage et gestion des présences pour une entreprise de 5 salariés en Tunisie (fuseau horaire `Africa/Tunis`, interface en français).

---

## 1. Fonctionnalités Principales

### A. Borne de Pointage Employés (Mode Kiosk plein écran)
- **Horloge digitale en direct** : Affichage temps réel de l'heure tunisienne (UTC+1) avec mise à jour à chaque seconde.
- **Pavé numérique tactile & Clavier physique** : Saisie sécurisée du code PIN à 4 chiffres (avec masquage et conservation des zéros en tête).
- **Début de service (Start Shift)** :
  - Validation du code PIN côté serveur par hachage salé (`bcrypt`).
  - Blocage strict des doubles pointages (au maximum 1 shift ouvert par employé).
  - Détection automatique des retards selon l'horaire prévu (ex: 08:00) et la tolérance (15 min).
  - Déclenchement d'un compteur dynamique du temps travaillé écoulé.
- **Fin de service (End Shift)** :
  - Clôture du pointage ouvert, calcul de la durée brute et nette.
  - Détection automatique des départs anticipés.
  - Feedback clair : `"Fin de service enregistrée à 17:02. Temps travaillé : 8 h 47 min"`.
- **Sécurité anti force brute** : Limiteur de requêtes temporisant le clavier après 5 tentatives erronées (verrouillage de 60 secondes).

### B. Console Administrateur RH
- **Authentification sécurisée** : Accès réservé aux administrateurs (les codes PIN employés ne donnent aucun accès à l'administration).
- **Tableau de bord (Dashboard)** :
  - Indicateurs clés en temps réel : Collaborateurs actifs, En service maintenant, Service terminé, Non pointés, Anomalies ouvertes, Total des heures travaillées.
  - Sélecteur de date pour inspecter n'importe quel jour passé.
  - Tableau de présence des 5 collaborateurs avec statuts explicites (*En service*, *Service terminé*, *Non pointé*, *Anomalie à vérifier*, *Absence à vérifier*).
- **Gestion des employés** :
  - Fiches individuelles (Matricule, Nom, Prénom, Département, Notes).
  - Création et modification de collaborateurs.
  - Attribution et changement de code PIN à 4 chiffres avec détection des doublons.
  - Activation / désactivation des employés.
- **Historique complet & Corrections manuelles** :
  - Table complète des pointages avec filtres (collaborateur, date, période, statut, anomalies) et pagination.
  - Modal d'inspection détaillée : chronologie des événements et journal d'audit.
  - **Correction manuelle certifiée** : Modification des heures d'arrivée ou de départ en cas d'oubli avec motif obligatoire (ex: *Oubli de pointage à l'arrivée*) et journalisation d'audit immuable (anciennes vs nouvelles valeurs).
- **Gestion des anomalies** :
  - Détection automatique : Arrivées tardives, Départs oubliés (> 12 h), Services anormalement longs (> 10 h), Départs anticipés, Absences non justifiées.
  - Qualification et résolution avec notes RH et traçabilité.
- **Rapports & Exports Excel (CSV)** :
  - Synthèses périodiques (Aujourd'hui, Cette semaine, Ce mois, Mois dernier, Personnalisé).
  - Export CSV encodé en UTF-8 avec BOM (`\uFEFF`) et séparateur point-virgule (`;`) pour une compatibilité native parfaite avec Microsoft Excel en français.
  - Feuille de présence imprimable (`Ctrl+P` / `window.print`).
- **Paramètres de l'entreprise** :
  - Raison sociale, heure de début (08:00), heure de fin (17:00), tolérance de retard (15 min), seuil d'alerte départ oublié (12 h), seuil shift long (10 h).

---

## 2. Données Initiales & Collaborateurs Préconfigurés

L'application est pré-initialisée avec 5 collaborateurs tunisiens :

| Matricule | Collaborateur | Département | Code PIN |
|---|---|---|---|
| **EMP-101** | Amine Mansour | Informatique & Systèmes | `1234` |
| **EMP-102** | Fatma Ben Ali | Ressources Humaines | `2345` |
| **EMP-103** | Mohamed Trabelsi | Logistique & Exploitation | `3456` |
| **EMP-104** | Sarra Khemir | Service Client | `4567` |
| **EMP-105** | Youssef Chahed | Commercial | `5678` |

### Identifiants Administrateur RH
- **E-mail** : `admin@pointagerh.tn`
- **Mot de passe** : `Admin@2026!`

---

## 3. Architecture Technique

- **Frontend** : React 19 + TypeScript + Tailwind CSS (palette neutre épurée, conformité typographique et zéro pill décorative).
- **Backend** : Node.js + Express exposant l'API REST sécurisée sous `/api/*`.
  - En local : `server.ts` (serveur Express + Vite).
  - En production (Vercel) : `api/index.ts` (fonction serverless) + `vercel.json`.
- **Base de données** : **Supabase / PostgreSQL** (driver `postgres.js`), chaîne de connexion via `SUPABASE_DB_URL`. Le schéma est provisionné automatiquement au premier démarrage et versionné dans `supabase/migrations/20261013000000_init_hr_attendance.sql`.
- **Authentification** : sessions administrateur **JWT stateless** (HS256) signées avec `JWT_SECRET`, compatibles avec un déploiement serverless multi-instances.

---

## 4. Lancement & Tests

### Prérequis
- **Node.js 20+**
- Un projet **Supabase** (base PostgreSQL hébergée).

### Configuration (`.env`)
Copiez `.env.example` vers `.env` et renseignez :
```
SUPABASE_DB_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
JWT_SECRET="une-chaine-aleatoire-longue-et-secrete"
PORT=3000
```
> Dans Supabase : **Project Settings → Database → Connection string → Connection pooling → Transaction** (port 6543). Le schéma et les données de démonstration sont créés automatiquement au premier démarrage.

### Installation & développement
```bash
npm install
npm run dev
```
L'application démarre sur le port 3000 (`http://localhost:3000`), avec rechargement à chaud Vite.

### Tests & vérification du typage
```bash
npm test     # tests unitaires; tests PostgreSQL exécutés si SUPABASE_DB_URL est défini
npm run lint # typage TypeScript
```

### Déploiement sur Vercel (production)
1. Importez le dépôt GitHub dans Vercel (**Add New → Project**).
2. Dans **Settings → Environment Variables**, ajoutez `SUPABASE_DB_URL` et `JWT_SECRET`.
3. Déployez : Vercel compile le frontend (`vite build` → `dist/`) et déploie l'API Express comme fonction serverless (`api/index.ts`).
4. Ajoutez ensuite votre domaine personnalisé : **Settings → Domains → Add** (aucune modification de code nécessaire).

### Persistance des données
Toutes les données (employés, pointages, anomalies, journal d'audit, paramètres) sont stockées dans **PostgreSQL Supabase** : elles persistent indépendamment du serveur et des redéploiements.
- **Sauvegarde** : Supabase effectue des sauvegardes automatiques ; un export SQL manuel est possible depuis le tableau de bord.
- **Remise à zéro** : videz les tables dans l'éditeur SQL Supabase ; les données de démonstration seront recréées au prochain démarrage si les tables sont vides.
