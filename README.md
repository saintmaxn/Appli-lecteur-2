# Lumière — lecteur IPTV

Une application web légère pour lire une playlist IPTV que vous fournissez et découvrir des chaînes selon vos habitudes de visionnage.

## Lancer l’application

Ouvrez `index.html` dans un navigateur moderne, ou servez le dossier avec un serveur HTTP local. Aucune installation ni compte n’est nécessaire.

## Charger une playlist

- Cliquez sur **Importer une playlist** pour choisir un fichier `.m3u` ou `.m3u8`.
- Ou collez une URL de playlist dans **Ajouter une playlist**. Certaines sources refusent les requêtes depuis le navigateur (CORS) : dans ce cas, téléchargez le fichier et importez-le localement.
- Sélectionnez une chaîne pour commencer la lecture. Les flux HLS sont lus avec le lecteur natif du navigateur ou hls.js lorsque nécessaire.

## Recommandations

L’application mémorise localement les chaînes regardées, leur groupe/catégorie et les favoris. Elle utilise ces signaux pour classer les chaînes similaires. Les données restent dans le stockage local du navigateur et peuvent être effacées avec **Réinitialiser les données**.

Utilisez uniquement des playlists et des flux que vous êtes autorisé à consulter. La compatibilité des flux dépend du navigateur, du format et des règles CORS de la source.
