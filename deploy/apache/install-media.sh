#!/usr/bin/env bash
# =====================================================================
# Installation du domaine média media.favorhelp.com (Apache, Ubuntu/Debian)
# Usage (depuis la racine du projet) :  sudo bash deploy/apache/install-media.sh
# =====================================================================
set -e

DOMAIN="media.favorhelp.com"
ROOT_DIR="/var/www/favor-storage"
CONF_SRC="$(dirname "$0")/${DOMAIN}.conf"
CONF_DST="/etc/apache2/sites-available/${DOMAIN}.conf"

if [ ! -d "$ROOT_DIR" ]; then
  echo "❌ Dossier introuvable : $ROOT_DIR"; exit 1
fi

echo "➡️  Modules Apache"
a2enmod headers alias >/dev/null

echo "➡️  Copie de la configuration"
cp "$CONF_SRC" "$CONF_DST"

echo "➡️  Activation du site"
a2ensite "${DOMAIN}.conf" >/dev/null

echo "➡️  Droits de lecture (lecture seule pour Apache)"
chmod -R o+rX "$ROOT_DIR"

echo "➡️  Vérification de la configuration"
apache2ctl configtest

echo "➡️  Rechargement d'Apache"
systemctl reload apache2

echo ""
echo "✅ Site média actif en HTTP."
echo "   Étape suivante (HTTPS) :"
echo "   sudo apt install -y certbot python3-certbot-apache"
echo "   sudo certbot --apache -d ${DOMAIN}"
