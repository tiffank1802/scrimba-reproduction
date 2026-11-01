# Scrim Studio

Une reproduction **indépendante** du principe pédagogique des scrims : la plateforme enregistre des opérations d’édition horodatées plutôt que des pixels, puis les rejoue dans un environnement de code interactif.

## Fonctionnalités incluses

- Éditeur Monaco multi-fichiers (HTML, CSS, JavaScript).
- Lecteur d’événements avec lecture/pause, seek, vitesses et snapshots périodiques.
- Rail Git visible dans la timeline : chaque modification de fichier devient une version, avec les branches apprenant à leur point de fork.
- Le bouton de lecture effectue une sauvegarde locale du scrim et de la branche active avant de relancer la timeline.
- Enregistreur d’opérations Monaco compactées, avec une horloge logique partagée.
- Capture audio facultative par `MediaRecorder`, synchronisée avec la session.
- Branches personnelles : toute modification effectuée en pause crée un « essai » local sans altérer la leçon d’origine.
- Prévisualisation HTML/CSS/JS dans une iframe isolée (`sandbox="allow-scripts"`) avec CSP restrictive et console relayée par `postMessage`.
- Menu **Compiler** : copie le fichier actif et ouvre Rust Playground ou Compiler Explorer dans un nouvel onglet isolé.
- Démonstration **PDF annoté** : un PDF réel généré localement, rendu avec PDF.js, dont les surlignages, commentaires, tracés, versions et branche personnelle sont rejouables dans une timeline.
- Persistance locale des sessions, audio et branches dans IndexedDB.
- Import/export de sessions JSON versionnées (`.scrim.json`).

## Démarrer

```bash
npm install
npm run dev
```

Le serveur Vite écoute sur toutes les interfaces. Ouvrez ensuite l’URL affichée par Vite.

## Vérifier

```bash
npm test
npm run build
```

## Notes de conception

- Les snapshots sont reconstruits après compactage, toutes les cinq secondes ou tous les cent événements. Le seek restaure le snapshot le plus proche avant de rejouer un nombre limité d’opérations.
- L’audio n’est jamais envoyé vers un serveur par l’application : il est stocké localement dans IndexedDB. L’export JSON conserve uniquement ses métadonnées ; l’audio doit être exporté/partagé séparément dans une future version archive.
- Le sandbox de prévisualisation n’utilise pas `allow-same-origin`, donc le code exécuté reste isolé du DOM et du stockage de l’application hôte.

## Limites actuelles

Cette première version est local-first et orientée navigateur desktop. La collaboration, les comptes, l’archivage audio dans un bundle et les environnements Node/WebContainers sont des évolutions prévues, pas des fonctionnalités incluses.
