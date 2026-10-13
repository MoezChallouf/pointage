# Intégration Supabase & PostgreSQL — PointageRH Tunisie

Ce dossier contient la configuration et le schéma de base de données PostgreSQL pour Supabase.

## Architecture

Le système utilise une séparation stricte entre les rôles :
1. **Écran de pointage Kiosk (Employés)** :
   - Accès public sécurisé via les routes API du serveur (`/api/kiosk/*`).
   - Les codes PIN à 4 chiffres sont vérifiés côté serveur par comparaison de hachages salés (`bcrypt` / `argon2id`).
   - Le serveur applique un limiteur de requêtes (rate-limiting) anti force brute.
   - Les clés de service Supabase (`service_role`) et les hachages de PIN ne sont jamais exposés au client navigateur.

2. **Console Administrateur (Gestion RH)** :
   - Authentification administrateur via Supabase Auth ou token de session administrative.
   - Politiques de sécurité RLS (Row Level Security) actives sur toutes les tables.
   - Les corrections manuelles génèrent des événements d'audit immuables (`audit_logs`) avec les anciennes et nouvelles valeurs.

## Déploiement du schéma sur Supabase

1. Connectez-vous à votre console [Supabase](https://supabase.com).
2. Ouvrez l'éditeur SQL (**SQL Editor**).
3. Exécutez le script situé dans `supabase/migrations/20261013000000_init_hr_attendance.sql`.
4. Ajoutez vos clés dans votre fichier `.env` :
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<votre-projet>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<votre-cle-anon>
   SUPABASE_SERVICE_ROLE_KEY=<votre-cle-service-role>
   ```

## Moteur de données persistant local
Pour un fonctionnement immédiat et autonome en environnement d'exécution, l'application intègre également un moteur transactionnel SQLite (`data/attendance.db`) qui réplique exactement le schéma relationnel, les contraintes d'unicité, les index partiels (`WHERE clock_out_at IS NULL`), et la journalisation d'audit.
