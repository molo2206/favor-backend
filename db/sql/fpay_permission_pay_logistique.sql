-- =====================================================================================
-- ✅ Base F-PAY (PAS favor_db) : la clé de FPAY_API_KEY_LOGISTIC reçoit la permission « pay »,
--    nécessaire pour ENCAISSER les paiements des colis (route api/external/pay).
--    La clé n'est pas régénérée. Ré-exécutable sans risque.
--
--    Remplacez COLLER_ICI_LA_VALEUR_DE_FPAY_API_KEY_LOGISTIC par la valeur de FPAY_API_KEY_LOGISTIC
--    du .env du SERVEUR (sans le mot « Bearer »), aux 3 endroits.
-- =====================================================================================

-- 1) Vérifier la clé trouvée (1 ligne attendue)
SELECT id, name, isActive, permissions
  FROM api_key
 WHERE `key` = 'COLLER_ICI_LA_VALEUR_DE_FPAY_API_KEY_LOGISTIC';

-- 2) Ajouter « pay » si elle ne l'a pas déjà
UPDATE api_key
   SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'pay'),
       updatedAt   = NOW()
 WHERE `key` = 'COLLER_ICI_LA_VALEUR_DE_FPAY_API_KEY_LOGISTIC'
   AND JSON_VALID(permissions)
   AND JSON_SEARCH(permissions, 'one', 'pay') IS NULL;

-- 3) Vérification : « pay » doit apparaître dans permissions
SELECT id, name, isActive, permissions
  FROM api_key
 WHERE `key` = 'COLLER_ICI_LA_VALEUR_DE_FPAY_API_KEY_LOGISTIC';
