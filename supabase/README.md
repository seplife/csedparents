# Envoi automatique du code d'activation par SMS (Twilio)

Fonctionnement : l'école ajoute une ligne dans `familles` (le code est généré s'il est vide) → une ligne est ajoutée à `sms_file` → l'Edge Function `envoyer-sms` envoie le SMS via Twilio.

## Mise en place

1. Exécutez `schema.sql` (déjà fait normalement), puis `sms_activation.sql` dans Supabase > SQL Editor.
   Avant cela, remplacez `A_REMPLACER_SECRET` par une longue valeur aléatoire (la même à l'étape 3).
2. Sur twilio.com : récupérez `Account SID` et `Auth Token` (Console), et un expéditeur : un numéro Twilio, un nom d'expéditeur alphanumérique, ou un Messaging Service.
   Vérifiez que l'envoi vers la Côte d'Ivoire est activé (Messaging > Settings > Geo permissions). Avec un compte d'essai, seuls les numéros vérifiés reçoivent des SMS.
3. Déployez la fonction avec la CLI Supabase (`npm i -g supabase`, `supabase login`) :

```bash
supabase link --project-ref cbcsadiglaxkhkpsukss
supabase secrets set TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1XXXXXXXXXX WEBHOOK_SECRET=...
supabase functions deploy envoyer-sms --no-verify-jwt
```

   Pour un Messaging Service, remplacez `TWILIO_FROM` par `TWILIO_MESSAGING_SERVICE_SID=MG...`.

## Suivi

- `select * from sms_file order by cree_le desc;` : statuts `en_attente`, `envoye`, `echec` et message d'erreur.
- Renvoyer un SMS : `insert into sms_file (famille_id) values ('...');`, ou remettez `statut='en_attente', tentatives=0` si la relance automatique (pg_cron, optionnelle dans `sms_activation.sql`) est activée.

> Ne mettez jamais `TWILIO_AUTH_TOKEN` ni `service_role` dans le code de l'application web.
