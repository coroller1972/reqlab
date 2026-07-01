# ReqLab

ReqLab est une SPA React qui permet de composer, envoyer, sauvegarder et rejouer des requetes HTTP directement depuis le navigateur. L'objectif est de proposer un outil leger, local et rapide pour tester des APIs, dans l'esprit d'un mini Postman, sans backend ni compte utilisateur.

![ReqLab icon](public/reqlab-icon.png)

## Fonctionnalites

- Envoi de requetes HTTP avec `fetch`
- Methodes supportees : `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
- Edition de l'URL, des headers et du body
- Visualisation de la reponse :
  - statut HTTP
  - temps d'execution
  - taille approximative
  - body
  - headers
- Affichage `Pretty JSON` pour les reponses JSON
- Formatage JSON du body de requete
- Autocompletion des headers HTTP courants :
  - noms de headers comme `Accept`, `Content-Type`, `Authorization`, `Cache-Control`
  - valeurs adaptees comme `application/json`, `Bearer`, `no-cache`, `fr-FR`
- Deux modes d'envoi :
  - `Navigateur` : envoi direct via `fetch`, soumis aux regles CORS
  - `Proxy` : envoi via `/api/proxy`, execute cote serveurless Node.js
- Historique et gestion des requetes :
  - creation d'une nouvelle requete
  - sauvegarde
  - selection depuis la liste
  - suppression individuelle via l'icone au survol
  - suppression complete des donnees locales
- Import et export des requetes au format JSON
- Persistance dans `localStorage`
- Theme clair/sombre persistant
- Interface responsive
- Icône et branding ReqLab integres
- Variables d'environnement locales utilisables dans l'URL, les headers et le body avec `${VARIABLE}`

## CORS et mode proxy

En mode `Navigateur`, les requetes sont executees par le navigateur avec `fetch`, ce qui signifie que les regles CORS s'appliquent.

Consequence : certaines APIs qui fonctionnent dans Postman peuvent etre bloquees dans ReqLab si elles n'autorisent pas explicitement les appels depuis le navigateur.

Dans ce cas, ReqLab peut utiliser le mode `Proxy`. Le frontend appelle `/api/proxy`, puis la Vercel Function appelle l'API cible cote serveur. Cela contourne les blocages CORS navigateur dans beaucoup de cas.

Le proxy inclut des garde-fous :

- methodes autorisees limitees aux methodes HTTP usuelles
- blocage des URLs locales ou privees (`localhost`, `127.0.0.1`, reseaux prives)
- resolution DNS et blocage des IPs privees
- timeout de 20 secondes
- taille de payload limitee
- filtrage de headers sensibles ou hop-by-hop
- token optionnel via `REQLAB_PROXY_TOKEN`

## Stack technique

- React 19
- Vite 6
- JavaScript
- CSS natif
- `localStorage`
- Vercel Function Node.js optionnelle pour le proxy
- Pas de librairie UI externe

## Installation

```bash
npm install
```

## Lancement en developpement

```bash
npm run dev
```

Vite expose ensuite l'application sur :

```text
http://localhost:5173/
```

ou :

```text
http://127.0.0.1:5173/
```

Ce mode lance uniquement Vite. Le mode `Proxy` necessite `vercel dev`.

## Lancement avec la Function Vercel

Installer la CLI Vercel si necessaire :

```bash
npm install -g vercel
```

Puis lancer :

```bash
npm run dev:vercel
```

La SPA et `/api/proxy` seront servis ensemble par l'environnement local Vercel.

## Variables d'environnement

Le proxy peut fonctionner sans token en local. Pour une deployment publique, configure un token :

```text
REQLAB_PROXY_TOKEN=une-valeur-longue-et-secrete
```

Dans ReqLab, ouvre la configuration via l'icone roue dentee, puis renseigne ce token dans le champ `Token proxy`. Le token est stocke uniquement dans le `localStorage` du navigateur.

Tu peux aussi restreindre l'origine autorisee :

```text
REQLAB_ALLOWED_ORIGIN=https://ton-domaine.vercel.app
```

## Build de production

```bash
npm run build
```

Le build est genere dans le dossier `dist/`.

## Preview du build

```bash
npm run preview
```

## Structure du projet

```text
.
├── index.html
├── package.json
├── api/
│   └── proxy.js
├── public/
│   └── reqlab-icon.png
└── src/
    ├── App.jsx
    ├── headerSuggestions.js
    ├── http.js
    ├── main.jsx
    ├── storage.js
    └── styles.css
```

### Fichiers principaux

- `src/App.jsx` : interface principale, etat React, gestion des requetes, import/export, themes.
- `src/http.js` : helpers HTTP, conversion des headers, envoi `fetch`, formatage JSON.
- `src/headerSuggestions.js` : listes d'autocompletion pour les noms et valeurs de headers.
- `src/storage.js` : persistance `localStorage` des requetes et du theme.
- `src/styles.css` : design system, layout, theme clair/sombre, responsive.
- `api/proxy.js` : Function Vercel Node.js utilisee par le mode proxy.
- `public/reqlab-icon.png` : icone de l'application et favicon.

## Donnees persistantes

Les requetes sauvegardees sont stockees dans le navigateur avec la cle :

```text
reqlab.requests.v1
```

Le theme est stocke avec la cle :

```text
reqlab.theme.v1
```

Le mode de transport et le token proxy local sont stockes avec :

```text
reqlab.transportMode.v1
reqlab.proxyToken.v1
```

Les variables d'environnement locales sont stockees avec :

```text
reqlab.environmentVariables.v1
```

## Variables d'environnement locales

Dans ReqLab, ouvre la configuration via l'icone roue dentee, puis ajoute des variables d'environnement locales.

Elles peuvent etre utilisees dans :

- l'URL
- les valeurs de headers
- le body

Exemple :

```text
Authorization: Bearer ${BEARER_TOKEN}
```

Au moment de l'envoi, ReqLab remplace `${BEARER_TOKEN}` par la valeur sauvegardee localement. La requete sauvegardee conserve le placeholder, ce qui permet de changer la valeur de la variable sans modifier chaque requete.

Si une variable referencee n'existe pas, ReqLab bloque l'envoi et affiche la variable manquante.

Le projet conserve aussi une compatibilite de migration avec les anciennes cles :

```text
requesty.requests.v1
requesty.theme.v1
```

Cela permet de recuperer les donnees creees avant le renommage de Requesty vers ReqLab.

## Format d'une requete sauvegardee

Une requete sauvegardee ressemble a ceci :

```json
{
  "id": "uuid",
  "name": "GET jsonplaceholder.typicode.com/todos/1",
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/todos/1",
  "headers": [
    {
      "id": "uuid",
      "key": "Accept",
      "value": "application/json"
    }
  ],
  "body": "",
  "createdAt": "2026-06-29T19:00:00.000Z",
  "updatedAt": "2026-06-29T19:01:00.000Z",
  "lastResponseSummary": {
    "status": 200,
    "statusText": "OK",
    "elapsedMs": 461,
    "receivedAt": "2026-06-29T19:01:00.000Z"
  }
}
```

## Import / export

L'export genere un fichier :

```text
reqlab-requests.json
```

Ce fichier contient un tableau de requetes sauvegardees. Il peut ensuite etre reimporte dans ReqLab.

L'import accepte un tableau JSON. Si le format est invalide, l'application affiche une erreur.

## Exemple de test rapide

1. Lancer l'application avec `npm run dev`
2. Garder la methode `GET`
3. Entrer l'URL :

```text
https://jsonplaceholder.typicode.com/todos/1
```

4. Cliquer sur `Envoyer`
5. Verifier que la reponse affiche un statut `200` et un body JSON formate.

Pour tester le mode proxy, lance l'application avec `npm run dev:vercel`, selectionne `Proxy`, puis envoie la meme requete.

## Theme sombre

ReqLab propose un theme clair et un theme sombre. Le bouton de theme se trouve dans l'en-tete, a cote du statut `Brouillon` ou `Sauvegardee`.

Le theme sombre utilise une palette inspiree Material/Codex App :

- fond principal tres sombre
- surfaces legerement elevees
- bordures sobres
- accent teal/cyan

## Notes de design

ReqLab est pense comme un outil de travail dense mais calme :

- l'ecran principal est l'outil lui-meme, pas une landing page
- la sidebar sert de liste de requetes sauvegardees
- la zone centrale compose la requete
- la zone de droite affiche la reponse
- les controles restent natifs, lisibles et accessibles

## Pistes d'evolution

- Ajouter des collections ou dossiers de requetes
- Ajouter des variables d'environnement
- Ajouter des tests automatises
- Ajouter une recherche dans l'historique
- Ajouter la duplication de requete
- Ajouter un mode d'affichage brut/preview pour HTML, XML ou images
- Ajouter l'export/import de collections compatibles Postman

## Licence

A definir selon l'usage prevu du projet.
