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
- **Backend** : Node.js (v22) + Express full-stack via `server.ts` avec API REST sécurisée sous `/api/*`.
- **Moteur de base de données** :
  1. **Exécution locale autonome** : SQLite (`node:sqlite` natif Node 22) dans `data/attendance.db` avec mode WAL, intégrité référentielle et contrainte d'unicité sur shift ouvert (`WHERE clock_out_at IS NULL`).
  2. **Schéma Supabase / PostgreSQL** : Script complet de migration dans `supabase/migrations/20261013000000_init_hr_attendance.sql` incluant les politiques de sécurité Row Level Security (RLS).

---

## 4. Lancement & Tests

### Prérequis
- **Node.js 22.16+** (requis pour le module natif `node:sqlite`). Aucune installation de PHP, MySQL ou XAMPP n'est nécessaire : le serveur Node embarque sa propre base SQLite.

### Installation
```bash
npm install
```

### Démarrage en développement
```bash
npm run dev
```
L'application démarre sur le port 3000 (`http://localhost:3000`), avec rechargement à chaud Vite.

### Exécution de la suite de tests automatisés
```bash
npm test
```
Exécute les 15 tests unitaires et d'intégration validant le calcul des durées, le passage de minuit, la détection des retards, l'unicité des shifts, la validation des PINs et le journal d'audit.

`npm run lint` vérifie le typage TypeScript.

### Compilation & exécution en production
```bash
npm run build   # compile le frontend -> dist/ et le serveur -> server.js
npm start       # lance le serveur en mode production (NODE_ENV=production)
```
- `npm run build` génère les fichiers statiques dans `dist/` puis regroupe le backend TypeScript dans un unique `server.js` via esbuild.
- `npm start` démarre le serveur qui sert à la fois l'API `/api/*` et l'interface React compilée, sur le port défini dans `.env` (`PORT`, défaut 3000).
- En production, l'application écoute sur `0.0.0.0` : elle est donc joignable depuis les autres postes du réseau local via `http://IP-DU-SERVEUR:3000`.

### Configuration (`.env`)
Copiez `.env.example` vers `.env` et adaptez si besoin :
```
PORT=3000
APP_TIMEZONE="Africa/Tunis"
APP_URL="http://localhost:3000"
```

### Persistance des données
Toutes les données (employés, pointages, anomalies, journal d'audit, paramètres) sont enregistrées automatiquement dans la base SQLite **`data/attendance.db`** (mode WAL). Aucune configuration supplémentaire n'est requise : les pointages survivent aux redémarrages du serveur.

- **Sauvegarde** : copiez les fichiers `data/attendance.db`, `data/attendance.db-wal` et `data/attendance.db-shm` (ou arrêtez le serveur puis copiez `data/`).
- **Remise à zéro** : supprimez le dossier `data/` puis relancez le serveur : les 5 collaborateurs et l'administrateur de démonstration seront recréés.
