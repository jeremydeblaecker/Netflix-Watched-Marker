# Netflix Watched Marker

Extension Firefox permettant de suivre localement la progression des vidéos Netflix et de repérer immédiatement les films et épisodes déjà regardés.

## Fonctionnalités

- suivi automatique de la progression de lecture ;
- passage automatique à l'état **Déjà vu** ;
- seuil configurable de 50 % à 99 %, avec 90 % par défaut ;
- bouton manuel ✓ sur les vignettes ;
- barre de progression optionnelle ;
- masquage facultatif des contenus déjà vus ;
- compteur de contenus vus et en cours ;
- import JSON d'un historique existant ;
- export de migration vers **Streaming Watched Manager** ;
- outil de test pour marquer l'onglet Netflix courant comme vu ;
- stockage local dans Firefox.

## Prérequis

- Firefox 140 ou supérieur.

## Installation temporaire

1. Clonez ou téléchargez le dépôt.
2. Ouvrez `about:debugging#/runtime/this-firefox`.
3. Cliquez sur **Charger un module complémentaire temporaire…**.
4. Sélectionnez `manifest.json`.
5. Ouvrez Netflix puis rechargez avec `Ctrl + F5`.

L'installation temporaire disparaît au redémarrage de Firefox.

Voir aussi [README_FIREFOX.md](README_FIREFOX.md).

## Fonctionnement

L'extension détecte les pages de type :

- `/watch/<id>` ;
- `/title/<id>` ;
- certains liens comportant un identifiant Netflix dans leurs paramètres.

Lorsqu'une vidéo est lue, sa progression est calculée à partir de la balise vidéo. Une fois le seuil configuré atteint, le contenu est enregistré comme vu.

Les vignettes correspondantes sont ensuite annotées automatiquement lors de la navigation sur Netflix.

## Import JSON

Depuis le popup :

1. cliquez sur **Importer les contenus déjà vus** ;
2. sélectionnez le fichier JSON de migration Netflix ;
3. les données sont fusionnées avec l'historique local.

Consultez [IMPORT_JSON.md](IMPORT_JSON.md) pour plus de détails.

## Migration vers Streaming Watched Manager

Le popup permet d'exporter l'historique dans un format compatible avec l'extension unifiée **Streaming Watched Manager**.

Cette fonction facilite la migration sans perdre les contenus déjà suivis.

## Permissions

- `storage` : historique et réglages locaux ;
- `activeTab` : action manuelle sur l'onglet actif ;
- accès à `netflix.com` : détection des contenus et ajout des marqueurs.

## Confidentialité

Les données de visionnage restent dans `browser.storage.local`.

Aucun historique n'est envoyé à un serveur appartenant à ce projet.

## Structure du projet

```text
.
├── manifest.json
├── background.js
├── content.js
├── content.css
├── popup.html
├── popup.js
├── popup.css
├── import.html
├── import.js
├── import.css
└── icons/
```

## Débogage

Netflix étant une application web dynamique, sa structure HTML peut évoluer.

Pour diagnostiquer un problème :

- inspectez l'extension depuis `about:debugging` ;
- utilisez les DevTools de Netflix pour le script de contenu ;
- vérifiez en priorité la détection des liens, des vignettes et de la balise vidéo.

## Limites

Le marquage dépend de la structure actuelle du site Netflix. Une modification importante de l'interface peut nécessiter une mise à jour de `content.js`.

## Avertissement

Projet indépendant, non affilié à Netflix.
