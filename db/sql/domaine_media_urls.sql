-- =====================================================================
-- DOMAINE MÉDIA : conversion des liens de fichiers déjà enregistrés en base
--   https://api-prod.favorhelp.com/uploads/<dossier>/<fichier>
--   →  https://media.favorhelp.com/<dossier>/<fichier>
--   (ex. …/uploads/cloudinary/product/x.webp → https://media.favorhelp.com/cloudinary/product/x.webp)
--
-- ⚠️ Faire une sauvegarde de favor_db avant.
-- ⚠️ Exécuter seulement quand https://media.favorhelp.com affiche bien les images.
-- Les liens du dossier legacy /uploads/users/ (servis uniquement par l'API) ne sont pas modifiés.
-- Si une table ou colonne n'existe pas sur le serveur (#1146 / #1054), ignorer la ligne.
-- Peut être relancé sans risque (les liens déjà convertis ne sont plus touchés).
-- N'utilise pas information_schema.
-- =====================================================================

UPDATE `addresses` SET `photos` = REPLACE(`photos`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photos` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photos` NOT LIKE '%/uploads/users/%';
UPDATE `app_settings` SET `logo` = REPLACE(`logo`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `logo` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `logo` NOT LIKE '%/uploads/users/%';
UPDATE `attribute_values` SET `imageUrl` = REPLACE(`imageUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `imageUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `imageUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_asset_assignments` SET `photoUrl` = REPLACE(`photoUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photoUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photoUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_asset_categories` SET `photoUrl` = REPLACE(`photoUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photoUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photoUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_asset_movements` SET `photoUrl` = REPLACE(`photoUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photoUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photoUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_assets` SET `photoUrl` = REPLACE(`photoUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photoUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photoUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_cash_transactions` SET `attachmentUrl` = REPLACE(`attachmentUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `attachmentUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `attachmentUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_chat_attachments` SET `thumbnailUrl` = REPLACE(`thumbnailUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `thumbnailUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `thumbnailUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_chat_attachments` SET `url` = REPLACE(`url`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `url` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `url` NOT LIKE '%/uploads/users/%';
UPDATE `bo_chat_conversations` SET `avatar` = REPLACE(`avatar`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `avatar` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `avatar` NOT LIKE '%/uploads/users/%';
UPDATE `bo_chat_messages` SET `metadata` = REPLACE(`metadata`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `metadata` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `metadata` NOT LIKE '%/uploads/users/%';
UPDATE `bo_fleet_documents` SET `fileUrl` = REPLACE(`fileUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `fileUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `fileUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_fleet_fuel_logs` SET `receiptUrl` = REPLACE(`receiptUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `receiptUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `receiptUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_fleet_maintenances` SET `photoUrl` = REPLACE(`photoUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photoUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photoUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_fleet_missions` SET `photoUrl` = REPLACE(`photoUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photoUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photoUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_fleet_vehicles` SET `photoUrl` = REPLACE(`photoUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photoUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photoUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_material_requests` SET `photoUrl` = REPLACE(`photoUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photoUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photoUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_media_files` SET `thumbnailUrl` = REPLACE(`thumbnailUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `thumbnailUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `thumbnailUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_media_files` SET `url` = REPLACE(`url`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `url` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `url` NOT LIKE '%/uploads/users/%';
UPDATE `bo_media_publications` SET `coverUrl` = REPLACE(`coverUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `coverUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `coverUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_media_services` SET `imageUrl` = REPLACE(`imageUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `imageUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `imageUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_media_vendor_assignments` SET `deliveryUrl` = REPLACE(`deliveryUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `deliveryUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `deliveryUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_media_vendor_assignments` SET `receiptUrl` = REPLACE(`receiptUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `receiptUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `receiptUrl` NOT LIKE '%/uploads/users/%';
UPDATE `bo_media_vendors` SET `photoUrl` = REPLACE(`photoUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photoUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photoUrl` NOT LIKE '%/uploads/users/%';
UPDATE `brands` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `category` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `colis` SET `photos` = REPLACE(`photos`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photos` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photos` NOT LIKE '%/uploads/users/%';
UPDATE `company` SET `banner` = REPLACE(`banner`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `banner` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `banner` NOT LIKE '%/uploads/users/%';
UPDATE `company` SET `logo` = REPLACE(`logo`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `logo` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `logo` NOT LIKE '%/uploads/users/%';
UPDATE `company` SET `registrationDocumentUrl` = REPLACE(`registrationDocumentUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `registrationDocumentUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `registrationDocumentUrl` NOT LIKE '%/uploads/users/%';
UPDATE `complaints` SET `attachments` = REPLACE(`attachments`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `attachments` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `attachments` NOT LIKE '%/uploads/users/%';
UPDATE `contracts` SET `documentUrl` = REPLACE(`documentUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `documentUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `documentUrl` NOT LIKE '%/uploads/users/%';
UPDATE `country_providers` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `delivery` SET `signatureImageUrl` = REPLACE(`signatureImageUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `signatureImageUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `signatureImageUrl` NOT LIKE '%/uploads/users/%';
UPDATE `driver_associations` SET `logoUrl` = REPLACE(`logoUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `logoUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `logoUrl` NOT LIKE '%/uploads/users/%';
UPDATE `driver_vehicles` SET `assuranceUrl` = REPLACE(`assuranceUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `assuranceUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `assuranceUrl` NOT LIKE '%/uploads/users/%';
UPDATE `driver_vehicles` SET `permiUrl` = REPLACE(`permiUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `permiUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `permiUrl` NOT LIKE '%/uploads/users/%';
UPDATE `driver_vehicles` SET `photos` = REPLACE(`photos`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `photos` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `photos` NOT LIKE '%/uploads/users/%';
UPDATE `driver_vehicles` SET `registrationUrl` = REPLACE(`registrationUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `registrationUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `registrationUrl` NOT LIKE '%/uploads/users/%';
UPDATE `hr_employees` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `image_product_entity` SET `url` = REPLACE(`url`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `url` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `url` NOT LIKE '%/uploads/users/%';
UPDATE `invoice_configuration` SET `logo` = REPLACE(`logo`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `logo` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `logo` NOT LIKE '%/uploads/users/%';
UPDATE `meals` SET `image_url` = REPLACE(`image_url`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image_url` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image_url` NOT LIKE '%/uploads/users/%';
UPDATE `network_providers` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `order_item_attributes` SET `imageUrl` = REPLACE(`imageUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `imageUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `imageUrl` NOT LIKE '%/uploads/users/%';
UPDATE `order_items` SET `attributesSnapshot` = REPLACE(`attributesSnapshot`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `attributesSnapshot` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `attributesSnapshot` NOT LIKE '%/uploads/users/%';
UPDATE `prestataires` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `products` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `ride_chat_messages` SET `audioUrl` = REPLACE(`audioUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `audioUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `audioUrl` NOT LIKE '%/uploads/users/%';
UPDATE `ride_chat_reports` SET `messageSnapshot` = REPLACE(`messageSnapshot`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `messageSnapshot` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `messageSnapshot` NOT LIKE '%/uploads/users/%';
UPDATE `room_image` SET `url` = REPLACE(`url`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `url` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `url` NOT LIKE '%/uploads/users/%';
UPDATE `shipments` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `specification` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `sub_order_items` SET `attributesSnapshot` = REPLACE(`attributesSnapshot`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `attributesSnapshot` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `attributesSnapshot` NOT LIKE '%/uploads/users/%';
UPDATE `type_companies` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `type_transport` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `users` SET `image` = REPLACE(`image`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `image` NOT LIKE '%/uploads/users/%';
UPDATE `users` SET `licenseDocumentUrl` = REPLACE(`licenseDocumentUrl`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `licenseDocumentUrl` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `licenseDocumentUrl` NOT LIKE '%/uploads/users/%';
UPDATE `vehicle_registrations` SET `availableDocuments` = REPLACE(`availableDocuments`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `availableDocuments` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `availableDocuments` NOT LIKE '%/uploads/users/%';
UPDATE `vehicle_registrations` SET `images` = REPLACE(`images`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `images` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `images` NOT LIKE '%/uploads/users/%';
UPDATE `vehicles` SET `images` = REPLACE(`images`, 'https://api-prod.favorhelp.com/uploads/', 'https://media.favorhelp.com/') WHERE `images` LIKE '%https://api-prod.favorhelp.com/uploads/%' AND `images` NOT LIKE '%/uploads/users/%';

-- =====================================================================
-- VÉRIFICATION : nombre de liens restants à l'ancien format (doit être 0,
-- sauf éventuellement des liens /uploads/users/ volontairement conservés)
-- =====================================================================
SELECT 'products.image' AS colonne, COUNT(*) AS restants FROM `products` WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%';
SELECT 'image_product_entity.url' AS colonne, COUNT(*) AS restants FROM `image_product_entity` WHERE `url` LIKE '%https://api-prod.favorhelp.com/uploads/%';
SELECT 'category.image' AS colonne, COUNT(*) AS restants FROM `category` WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%';
SELECT 'brands.image' AS colonne, COUNT(*) AS restants FROM `brands` WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%';
SELECT 'company.logo' AS colonne, COUNT(*) AS restants FROM `company` WHERE `logo` LIKE '%https://api-prod.favorhelp.com/uploads/%';
SELECT 'company.banner' AS colonne, COUNT(*) AS restants FROM `company` WHERE `banner` LIKE '%https://api-prod.favorhelp.com/uploads/%';
SELECT 'users.image' AS colonne, COUNT(*) AS restants FROM `users` WHERE `image` LIKE '%https://api-prod.favorhelp.com/uploads/%';

