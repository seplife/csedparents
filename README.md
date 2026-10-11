# CSED Parents+ : application web parent

Application web pour les parents, utilisable dans un navigateur sur téléphone et sur ordinateur.
Projet React + Vite, indépendant de l'application Android et de l'espace administration.

Elle utilise **la même base Supabase** que le reste du projet (`supabase/schema.sql`) : mêmes comptes parents, mêmes codes d'activation, mêmes données. Rien n'est à modifier dans la base.

## Prérequis

- Node.js 18 ou plus récent
- La base Supabase déjà créée (voir le README du projet principal), avec « Confirm email » désactivé

## Lancer en local

```bash
npm install
cp .env.example .env      # puis renseignez l'URL et la clé anon de votre projet Supabase
npm run dev
```

L'application s'ouvre sur http://localhost:5173.

## Mettre en ligne

```bash
npm run build
```

Le dossier `dist/` contient le site à publier sur n'importe quel hébergement de fichiers statiques.
Sur Vercel ou Netlify : importez le projet, puis ajoutez les deux variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans les réglages avant de déployer.

La clé `anon` peut être publique : elle ne donne accès à rien sans connexion. Ne mettez **jamais** la clé `service_role` dans ce projet.

## Contenu

| Fichier | Rôle |
|---|---|
| `src/api.js` | Connexion à Supabase : comptes, activation, lecture des données |
| `src/App.jsx` | Session et enchaînement des écrans |
| `src/Auth.jsx` | Connexion, première connexion, activation |
| `src/Dashboard.jsx` | Les six rubriques : accueil, horaires, contrôles, notes, présences, scolarité |
| `src/export.js` | Téléchargement des données d'un enfant en fichier zip |
| `src/styles.css` | Mise en page (téléphone et ordinateur, thème clair et sombre) |

## Limites connues

- L'interface a été testée dans un navigateur avec un faux serveur, **pas avec une vraie base Supabase**. Faites un essai complet avec une famille de test avant la mise en service.
- Mot de passe oublié : pas de réinitialisation automatique (voir le README du projet principal).
- Le paiement se fait auprès de l'établissement ; l'application affiche seulement les échéances.
- Pas de notifications ni de fonctionnement hors connexion.
