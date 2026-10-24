# Caisse Pâtisserie : application tablette hors ligne

Caisse tactile pour pâtisserie / boulangerie : ventes, stock avec alertes, tableau de bord avec graphiques,
caissiers avec code PIN, clôture de caisse (ticket Z), interface français / arabe, tickets pour imprimante thermique.

## Comment ça marche (à comprendre avant d'installer)

- C'est une **application web installable (PWA)** : aucun code à compiler. Les fichiers sont copiés sur la tablette
  la première fois, puis l'application démarre **sans Internet**.
- Les données (produits, ventes, utilisateurs) sont dans la **base IndexedDB du navigateur de la tablette**
  (équivalent d'un fichier SQLite local). Elles ne quittent jamais la tablette.
- Le ticket est **dessiné comme une image** puis converti en commandes ESC/POS. Ainsi l'arabe, les accents et le
  français s'impriment pareil sur n'importe quelle imprimante thermique.
- Pour imprimer sur une **imprimante réseau**, une page web ne peut pas ouvrir de connexion directe. On utilise l'application
  Android gratuite **RawBT**, qui reçoit le ticket et l'envoie à l'imprimante (réseau Wi-Fi/Ethernet, port 9100).

## Installation, étape par étape

### 1. Mettre les fichiers en ligne (une seule fois, avec Internet)
Une PWA ne s'installe que depuis une adresse **HTTPS**. Il faut donc publier le dossier sur un hébergement statique gratuit
(par exemple GitHub Pages ou Netlify : on y dépose le dossier tel quel, sans réglage). Notez l'adresse obtenue.
Après la première ouverture, plus besoin d'Internet pour vendre.

### 2. Installer sur la tablette Android
1. Ouvrir l'adresse dans **Chrome** sur la tablette.
2. Menu ⋮ puis **Installer l'application** (ou **Ajouter à l'écran d'accueil**).
3. Ouvrir l'application une fois **avec Internet** et attendre 10 secondes (elle se copie sur la tablette).
4. Couper le Wi-Fi/Internet et la rouvrir : elle doit démarrer normalement.

### 3. Configurer l'imprimante réseau avec RawBT
1. Installer **RawBT** depuis le Play Store.
2. Dans RawBT, ajouter l'imprimante en type **réseau (Ethernet/Wi-Fi)**, avec l'**adresse IP** de l'imprimante et le port **9100**.
   (L'IP s'obtient en imprimant la page d'auto-test de l'imprimante, souvent en maintenant le bouton FEED à l'allumage.)
   Régler la largeur du papier (58 ou 80 mm) et faire un test d'impression depuis RawBT.
3. Dans l'application Caisse : **Réglages → Impression** :
   - largeur du papier : 58 ou 80 mm ;
   - méthode : **RawBT** ;
   - bouton **Imprimer un ticket test**.

> **À tester le premier jour.** L'envoi du ticket vers RawBT utilise le mécanisme d'ouverture directe de RawBT
> (`rawbt:`). Je n'ai pas pu le tester avec une vraie tablette ni une vraie imprimante. Si le bouton « RawBT » ne fait rien,
> choisissez la méthode **Système** : le ticket passe alors par la boîte d'impression d'Android, où RawBT est proposé comme service
> d'impression. Si besoin, dites-moi ce que fait votre tablette et on ajuste.

### 4. Premier démarrage
- Profils créés : **Admin (PIN 1234)** et **Caissier (PIN 1111)**. **Changez ces codes tout de suite** :
  Réglages → Utilisateurs.
- Réglages → Boutique : nom, adresse, téléphone, message de fin de ticket, devise.
- Stock : adaptez les produits (noms français et arabe, prix, stock, seuil d'alerte).
- Pour voir les graphiques sans attendre : Réglages → Données de démonstration → *Ajouter des ventes de démo*
  (elles ne touchent pas au stock et se suppriment à part).

## Utilisation au quotidien
1. **Matin** : se connecter avec son PIN, **ouvrir la caisse** en comptant le fond de caisse.
2. **Ventes** : toucher les produits, ajuster les quantités, **Remise** si besoin, **Encaisser** (espèces avec rendu monnaie, ou carte), ticket imprimé.
3. **Erreur de vente** (administrateur) : Ventes → toucher le ticket → **Annuler la vente** (le stock est remis).
4. **Soir** : **Clôture** → compter les espèces → l'écart s'affiche → **Clôturer la caisse** (ticket Z imprimé).
5. **Stock** : bouton **Réappro.** à la réception de marchandise ; les produits sous le seuil apparaissent en alerte.

## Sauvegarde : très important
Les données sont **uniquement sur la tablette**. Si on efface les données de Chrome, ou si la tablette est perdue ou réinitialisée, tout disparaît.
Faites **Réglages → Sauvegarde → Exporter** régulièrement (par exemple chaque soir) et gardez le fichier ailleurs (clé USB, e-mail).
**Importer** restaure la sauvegarde sur la même tablette ou une autre.

## À savoir (limites actuelles)
- Une seule tablette = une seule base : plusieurs tablettes ne partagent pas leurs ventes (cela demanderait un petit serveur).
- Les noms de **catégories** sont libres et ne sont pas traduits automatiquement en arabe.
- Le paiement par **carte** est seulement enregistré (aucune connexion à un terminal bancaire).
- Mise à jour de l'application : republier les fichiers, puis rouvrir l'application avec Internet (la nouvelle version
  s'installe en arrière-plan). Pour forcer le renouvellement du cache, changer le numéro `CACHE = 'caisse-v1'` dans `sw.js`.
- Les codes PIN protègent l'accès à l'écran, mais pas contre quelqu'un qui aurait accès aux données du navigateur.

## Contenu du dossier

```
index.html            page unique
app.js                écrans : connexion, caisse, ventes, clôture, stock, tableau de bord, réglages
db.js                 base IndexedDB (ventes + baisse de stock en une seule transaction)
print.js              dessin du ticket, conversion ESC/POS, envoi RawBT / impression système
charts.js             graphiques SVG
i18n.js               textes français et arabe
ui.js                 petits outils d'interface
styles.css            apparence
sw.js                 service worker (fonctionnement hors ligne)
manifest.webmanifest  nom et icônes de l'application
icons/                icônes
```
