# Intégration Supabase / PostgreSQL — PointageRH Tunisie

Base de données de production : **PostgreSQL hébergé sur Supabase**, accédée
côté serveur uniquement via le driver `postgres.js`.

## Configuration

1. Créez un projet sur [Supabase](https://supabase.com).
2. Récupérez la chaîne de connexion : **Project Settings → Database →
   Connection string → Connection pooling → Transaction** (port `6543`).
3. Renseignez-la dans `.env` et dans les variables d'environnement Vercel :

   ```env
   SUPABASE_DB_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
   JWT_SECRET="une-chaine-aleatoire-longue-et-secrete"
   ```

## Schéma

- Le schéma est provisionné **automatiquement** au premier démarrage du
  serveur (`server/db.ts` → `createSchema()` puis `seedDatabase()`).
- Il est également versionné ici : `supabase/migrations/20261013000000_init_hr_attendance.sql`
  (à exécuter dans le **SQL Editor** si vous préférez le créer manuellement).

## Sécurité

- L'accès à la base se fait **exclusivement côté serveur** via la chaîne de
  connexion PostgreSQL (rôle `postgres`). Aucune donnée n'est exposée
  directement au navigateur.
- Les codes PIN employés sont hachés (`bcrypt`) et ne quittent jamais le
  serveur. Row Level Security est donc inutile (le rôle propriétaire
  contourne RLS de toute façon).
- Les sessions administrateur sont des **JWT HS256** signés avec `JWT_SECRET`
  (compatible serverless, aucune session en mémoire).
