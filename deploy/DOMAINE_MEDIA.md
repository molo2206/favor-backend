# Domaine média — media.favorhelp.com

Les fichiers (images, vidéos, PDF) sont servis par Apache sur `https://media.favorhelp.com`.
L'URL de l'API n'apparaît plus dans les liens.

| Dossier serveur | Ancien lien | Nouveau lien |
|---|---|---|
| /var/www/favor-storage/product/x.webp | https://api-prod.favorhelp.com/uploads/product/x.webp | https://media.favorhelp.com/product/x.webp |
| /var/www/favor-storage/cloudinary/product/x.webp | https://api-prod.favorhelp.com/uploads/cloudinary/product/x.webp | https://media.favorhelp.com/cloudinary/product/x.webp |

## 1. DNS
Enregistrement A `media` → IP du serveur (Cloudflare : nuage gris pendant certbot).

## 2. Apache
```bash
sudo bash deploy/apache/install-media.sh
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d media.favorhelp.com      # choisir « Redirect »
curl -I https://media.favorhelp.com/MATALI.png   # → 200 OK
```

## 3. Backend
Ajouter au `.env` du serveur (garder le reste du .env serveur) :
```env
MEDIA_BASE_URL=https://media.favorhelp.com
MEDIA_LEGACY_ORIGINS=https://api-prod.favorhelp.com
```
Puis :
```bash
npm install
npm run build
pm2 restart all          # ou votre commande habituelle
```
Les logs de démarrage affichent : `Media URL: https://media.favorhelp.com`.

## 4. SQL (optionnel, après vérification)
Sauvegarde de favor_db, puis exécuter `db/sql/domaine_media_urls.sql` dans phpMyAdmin.
Erreur #1146 / #1054 sur une ligne → l'ignorer et continuer.
Retour arrière : en commentaire à la fin du fichier.

## Dépannage
- 403 : `sudo chmod -R o+rX /var/www/favor-storage`
- 404 : vérifier le chemin réel (`find /var/www/favor-storage -name "<fichier>"`)
- Erreurs : `sudo tail -30 /var/log/apache2/media.favorhelp.com-error.log`
