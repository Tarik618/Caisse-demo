# Démo sur iPhone : marche à suivre

Cette version contient 7 jours de ventes fictives (ajoutées au premier lancement) pour que les graphiques soient remplis.
Pour une version « client » sans ventes fictives : dans `app.js`, mettre `const DEMO_BUILD = false;`.

## 1. Mettre le dossier en ligne (une fois, avec Internet)
iPhone n'installe une application hors ligne que depuis une adresse **HTTPS**.
Option simple : **GitHub Pages**.
1. Créer un compte sur github.com, puis **New repository** (nom : `caisse-demo`, public).
2. **Add file → Upload files**, glisser **tout le contenu** du dossier (les fichiers, pas le dossier parent), puis **Commit changes**.
3. **Settings → Pages → Branch : main, dossier / (root) → Save**. Après 1 à 2 minutes, l'adresse est `https://TON-NOM.github.io/caisse-demo/`.

## 2. Installer sur l'iPhone
1. Ouvrir l'adresse dans **Safari** (pas Chrome).
2. Bouton **Partager** (carré avec flèche) → **Sur l'écran d'accueil** → **Ajouter**.
3. Ouvrir l'application **depuis l'icône** de l'écran d'accueil, avec Internet, et attendre 10 secondes.
4. Mode avion → rouvrir : elle doit démarrer.

## Codes : Admin 1234, Caissier 1111

## À savoir sur iPhone
- Les données de l'icône sont séparées de celles de Safari : toujours utiliser l'icône.
- L'impression directe ne marche pas depuis iPhone : l'aperçu du ticket s'affiche à l'écran (parfait pour une démo).
- Mise à jour : republier les fichiers, puis fermer complètement l'application et la rouvrir deux fois avec Internet.
