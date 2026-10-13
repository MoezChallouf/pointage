import 'dotenv/config';
import express from 'express';
import { initDatabase } from '../server/db.js';
import { apiRouter } from '../server/routes.js';

// ---------------------------------------------------------------------------
// Fonction serverless Vercel : toute l'API Express est exposée ici.
// Les requêtes /api/* sont routées vers ce fichier via vercel.json.
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Provisionne le schéma + données de démonstration une seule fois par instance.
let initPromise: Promise<void> | null = null;
function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initDatabase().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

// Doit s'exécuter AVANT les routes qui accèdent à la base de données.
app.use(async (req, res, next) => {
  try {
    await ensureInitialized();
    next();
  } catch (err) {
    next(err);
  }
});

// Monte le routeur sur /api (chemin d'origine préservé par Vercel) et sur /
// par sécurité si le préfixe venait à être retiré.
app.use('/api', apiRouter);
app.use('/', apiRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

export default app;
