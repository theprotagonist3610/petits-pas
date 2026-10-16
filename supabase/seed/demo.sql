-- =============================================================================
-- Petits Pas — données fictives pour tester les fonctionnalités (hors connexion)
-- =============================================================================
--
-- À exécuter dans le SQL Editor de Supabase, sur un projet de TEST uniquement (toutes les migrations appliquées).
-- Réexécutable : les données de démo d'un passage précédent sont d'abord supprimées.
-- Pour tout retirer : supabase/seed/demo_cleanup.sql.
--
-- Contenu :
--   * 6 parents et 7 professionnels fictifs (e-mails @demo.petitspas.test, connexion impossible) ;
--   * tarifs (seulement s'ils ne sont pas déjà fixés) et 3 promotions « [Démo] » (en cours, à venir, terminée) ;
--   * ~30 consultations dans tous les états : en attente, confirmées, payées (dont prix promotionnel),
--     terminées, annulées, remboursées ; téléconsultations payées → conversations ouvertes ;
--   * gains des professionnels, une demande de paiement en attente et une déjà payée ;
--   * fil d'actualité : publications (équipe, professionnels, parents) avec questions et réponses,
--     dont une publication de parent en attente de validation ;
--   * si vous avez activé votre espace professionnel (compte administrateur) : des demandes à prendre dans
--     votre spécialité et votre pays, et des consultations à vous (agenda, comptabilité).
--
-- Non couvert : les messages (chiffrés sur l'appareil, impossibles à fabriquer en SQL) — testez-les avec de vrais comptes.

begin;

-- -----------------------------------------------------------------------------
-- 0. Nettoyage d'un passage précédent
-- -----------------------------------------------------------------------------

create temporary table demo_old_users on commit drop as
  select id from auth.users where email like '%@demo.petitspas.test';

create temporary table demo_old_consultations on commit drop as
  select id from public.consultations where parent_id in (select id from demo_old_users);

create temporary table demo_old_payouts on commit drop as
  select distinct payout_id as id from public.professional_earnings
  where payout_id is not null
    and (consultation_id in (select id from demo_old_consultations)
         or professional_id in (select p.id from public.professionals p where p.user_id in (select id from demo_old_users)));

delete from public.professional_earnings
where consultation_id in (select id from demo_old_consultations)
   or professional_id in (select p.id from public.professionals p where p.user_id in (select id from demo_old_users));
delete from public.payout_requests
where id in (select id from demo_old_payouts)
   or professional_id in (select p.id from public.professionals p where p.user_id in (select id from demo_old_users));
delete from public.feed_comments where author_id in (select id from demo_old_users);
delete from public.feed_posts where author_id in (select id from demo_old_users) or body like '[Démo]%';
delete from public.consultations where id in (select id from demo_old_consultations);
delete from public.professionals where user_id in (select id from demo_old_users);
delete from auth.users where id in (select id from demo_old_users);
delete from public.promotions where name like '[Démo]%';

-- -----------------------------------------------------------------------------
-- Outils (fonctions temporaires, supprimées à la fin de la session)
-- -----------------------------------------------------------------------------

-- Compte fictif : sans mot de passe ni identité, il ne permet pas de se connecter.
-- Le trigger d'inscription crée la fiche parent (sauf account_type = professional).
create function pg_temp.demo_user(p_email text, p_meta jsonb)
returns uuid
language plpgsql
as $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email, '', now() - interval '60 days',
    '{"provider":"email","providers":["email"]}'::jsonb, p_meta, now() - interval '60 days', now(),
    '', '', '', ''
  );
  return uid;
end;
$$;

create function pg_temp.demo_parent(p_email text, p_first text, p_last text, p_sex text, p_country text, p_phone text)
returns uuid
language sql
as $$
  select pg_temp.demo_user(p_email, jsonb_build_object(
    'first_name', p_first, 'last_name', p_last, 'sex', p_sex, 'country', p_country, 'phone', p_phone))
$$;

create function pg_temp.demo_pro(
  p_email text, p_first text, p_last text, p_specialty text, p_country text, p_facility text, p_city text,
  p_verified boolean default true, p_active boolean default true
)
returns uuid
language plpgsql
as $$
declare
  uid uuid := pg_temp.demo_user(p_email, '{"account_type":"professional"}'::jsonb);
  pid uuid;
begin
  insert into public.professionals (
    user_id, first_name, last_name, specialty, country, facility_name, city, phone, email,
    license_number, offers_teleconsultation, offers_appointment, verified_at, is_active, avatar_path
  ) values (
    uid, p_first, p_last, p_specialty, p_country, p_facility, p_city, '+229 01 90 00 00 00', p_email,
    'DEMO-' || upper(substr(md5(p_email), 1, 6)), true, true,
    case when p_verified then now() - interval '30 days' end, p_active,
    -- Photo fictive : le fichier n'existe pas, l'application affiche les initiales.
    uid::text || '/demo.webp'
  ) returning id into pid;
  return pid;
end;
$$;

-- Nouvelle demande (prix calculé par la base, promotion comprise, au moment de l'insertion).
create function pg_temp.demo_request(
  p_parent uuid, p_type text, p_specialty text, p_country text, p_for_child boolean,
  p_age_months int, p_sex text, p_reason text, p_created_ago interval, p_preferred_in interval default null
)
returns uuid
language plpgsql
as $$
declare
  cid uuid;
begin
  insert into public.consultations (
    parent_id, type, requested_specialty, country, child_ref, child_age_months, child_sex,
    reason, preferred_at, contact_phone, consent_at, created_at
  ) values (
    p_parent, p_type, p_specialty, p_country,
    case when p_for_child then encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex') end,
    case when p_for_child then p_age_months end,
    case when p_for_child then p_sex end,
    p_reason, case when p_preferred_in is not null then now() + p_preferred_in end,
    '+229 01 97 00 00 00', now() - p_created_ago, now() - p_created_ago
  ) returning id into cid;
  return cid;
end;
$$;

-- Fait avancer une demande comme dans la vraie vie (les triggers : historique, prix, conversation, gain).
--   p_target : confirmed | completed | cancelled · p_paid : payée ? · p_paid_amount : montant payé si ≠ prix
create function pg_temp.demo_progress(
  p_id uuid, p_pro uuid, p_target text, p_scheduled timestamptz,
  p_paid boolean default false, p_paid_amount numeric default null, p_note text default null
)
returns void
language plpgsql
as $$
begin
  update public.consultations
  set professional_id = p_pro, status = 'confirmed', scheduled_at = p_scheduled, professional_notes = p_note
  where id = p_id;

  if p_paid then
    update public.consultations
    set payment_status = 'paid',
        paid_amount = coalesce(p_paid_amount, price_amount, 5000),
        paid_currency = coalesce(price_currency, (select currency from public.platform_settings where id)),
        paid_at = now() - interval '1 day',
        payment_method = 'mobile_money',
        payment_reference = 'DEMO-' || upper(substr(md5(p_id::text), 1, 8))
    where id = p_id;
  end if;

  if p_target = 'completed' then
    update public.consultations set status = 'completed' where id = p_id;
  elsif p_target = 'cancelled' then
    update public.consultations set status = 'cancelled', cancelled_at = now(),
      professional_notes = coalesce(p_note, 'Indisponible à cette date, merci de refaire une demande.')
    where id = p_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Tarifs (sans écraser une grille existante) et promotions
-- -----------------------------------------------------------------------------

insert into public.consultation_prices (specialty, type, amount)
select v.specialty, v.type,
       case when s.currency = 'EUR' then round(v.amount / 655.957, 2) else v.amount end
from (values
  ('general_practitioner', 'teleconsultation', 5000),
  ('general_practitioner', 'appointment', 8000),
  ('pediatrician', 'teleconsultation', 7000),
  ('pediatrician', 'appointment', 10000),
  ('pediatric_neurologist', 'teleconsultation', 15000),
  ('pediatric_neurologist', 'appointment', 20000)
) as v(specialty, type, amount)
cross join public.platform_settings s
where s.id
on conflict (specialty, type) do nothing;

insert into public.promotions (name, description, specialties, types, discount_kind, discount_value, currency, starts_at, ends_at)
select '[Démo] Rentrée pédiatrie', 'Téléconsultations pédiatriques à −20 %', array['pediatrician'], array['teleconsultation'],
       'percent', 20, null, now() - interval '5 days', now() + interval '20 days'
union all
select '[Démo] Semaine du généraliste', 'Rendez-vous chez le généraliste à prix réduit', array['general_practitioner'], array['appointment'],
       'fixed_price', case when s.currency = 'EUR' then 5 else 3000 end, s.currency, now() + interval '7 days', now() + interval '14 days'
from public.platform_settings s where s.id
union all
select '[Démo] Été', 'Promotion terminée (historique)', array['general_practitioner', 'pediatrician'], array['teleconsultation', 'appointment'],
       'percent', 15, null, now() - interval '60 days', now() - interval '30 days';

-- -----------------------------------------------------------------------------
-- 2. Parents, professionnels et consultations
-- -----------------------------------------------------------------------------

do $$
declare
  -- Parents
  afi uuid := pg_temp.demo_parent('afi.adjovi@demo.petitspas.test', 'Afi', 'Adjovi', 'female', 'BJ', '+229 01 97 11 22 33');
  koffi uuid := pg_temp.demo_parent('koffi.mensah@demo.petitspas.test', 'Koffi', 'Mensah', 'male', 'TG', '+228 90 12 34 56');
  aicha uuid := pg_temp.demo_parent('aicha.issoufou@demo.petitspas.test', 'Aïcha', 'Issoufou', 'female', 'NE', '+227 90 11 22 33');
  rose uuid := pg_temp.demo_parent('rose.houngbo@demo.petitspas.test', 'Rose', 'Houngbo', 'female', 'BJ', '+229 01 66 55 44 33');
  yao uuid := pg_temp.demo_parent('yao.agbeko@demo.petitspas.test', 'Yao', 'Agbéko', 'male', 'TG', '+228 91 22 33 44');
  fati uuid := pg_temp.demo_parent('fati.moussa@demo.petitspas.test', 'Fati', 'Moussa', 'female', 'NE', '+227 96 55 44 33');

  -- Professionnels
  dossou uuid := pg_temp.demo_pro('m.dossou@demo.petitspas.test', 'Marc', 'Dossou', 'pediatrician', 'BJ', 'Clinique Les Bambins', 'Cotonou');
  akakpo uuid := pg_temp.demo_pro('e.akakpo@demo.petitspas.test', 'Esther', 'Akakpo', 'general_practitioner', 'BJ', 'Centre de santé de Fidjrossè', 'Cotonou');
  lawson uuid := pg_temp.demo_pro('k.lawson@demo.petitspas.test', 'Kodjo', 'Lawson', 'pediatrician', 'TG', 'CHU Sylvanus Olympio', 'Lomé');
  amegah uuid := pg_temp.demo_pro('s.amegah@demo.petitspas.test', 'Sena', 'Amegah', 'pediatric_neurologist', 'TG', 'Polyclinique Saint-Joseph', 'Lomé');
  harouna uuid := pg_temp.demo_pro('a.harouna@demo.petitspas.test', 'Abdou', 'Harouna', 'general_practitioner', 'NE', 'CSI Yantala', 'Niamey');
  -- À vérifier (numéro d'ordre) et désactivé : pour tester l'administration.
  sossou uuid := pg_temp.demo_pro('j.sossou@demo.petitspas.test', 'Justine', 'Sossou', 'pediatrician', 'BJ', 'Cabinet Sossou', 'Porto-Novo', false);
  kodjo uuid := pg_temp.demo_pro('p.kodjo@demo.petitspas.test', 'Paul', 'Kodjo', 'general_practitioner', 'TG', 'Cabinet Kodjo', 'Kara', true, false);

  -- Votre propre fiche professionnelle (administrateur qui exerce), si elle existe.
  me uuid;
  my_specialty text;
  my_country text;
  c uuid;
  payout uuid;
begin
  select p.id, p.specialty, p.country into me, my_specialty, my_country
  from public.professionals p join public.admins a on a.user_id = p.user_id
  order by p.created_at limit 1;

  -- ---------------------------------------------------------------------------
  -- Demandes en attente (files « Demandes à prendre » des professionnels)
  -- ---------------------------------------------------------------------------
  perform pg_temp.demo_request(afi, 'teleconsultation', 'pediatrician', 'BJ', true, 7, 'female',
    'Fièvre à 38,5 °C depuis hier soir, elle boit moins que d’habitude.', interval '3 hours', interval '1 day');
  perform pg_temp.demo_request(rose, 'appointment', 'pediatrician', 'BJ', true, 18, 'male',
    'Il tousse la nuit depuis une semaine, sans fièvre.', interval '1 day', interval '3 days');
  perform pg_temp.demo_request(afi, 'appointment', 'general_practitioner', 'BJ', false, null, null,
    'Fatigue importante et maux de tête depuis l’accouchement.', interval '5 hours');
  perform pg_temp.demo_request(koffi, 'teleconsultation', 'pediatric_neurologist', 'TG', true, 26, 'male',
    'Il ne dit pas encore de mots à 2 ans, mais comprend bien ce qu’on lui dit.', interval '2 days');
  perform pg_temp.demo_request(yao, 'teleconsultation', 'pediatrician', 'TG', true, 4, 'female',
    'Plaques rouges sur les joues depuis trois jours.', interval '30 minutes');
  perform pg_temp.demo_request(aicha, 'appointment', 'general_practitioner', 'NE', true, 40, 'female',
    'Diarrhée depuis deux jours, elle mange peu.', interval '6 hours', interval '1 day');

  -- ---------------------------------------------------------------------------
  -- Confirmées, pas encore payées (agenda ; messagerie pas encore ouverte)
  -- ---------------------------------------------------------------------------
  c := pg_temp.demo_request(rose, 'appointment', 'pediatrician', 'BJ', true, 9, 'female',
    'Contrôle de croissance : elle prend peu de poids.', interval '2 days');
  perform pg_temp.demo_progress(c, dossou, 'confirmed', date_trunc('hour', now()) + interval '1 day 10 hours',
    p_note => 'Merci d’apporter le carnet de santé.');

  c := pg_temp.demo_request(yao, 'teleconsultation', 'pediatrician', 'TG', true, 14, 'male',
    'Il se réveille plusieurs fois par nuit en pleurant.', interval '1 day');
  perform pg_temp.demo_progress(c, lawson, 'confirmed', now() + interval '4 hours');

  -- ---------------------------------------------------------------------------
  -- Confirmées et payées : téléconsultations → conversation ouverte 10 jours
  -- ---------------------------------------------------------------------------
  c := pg_temp.demo_request(afi, 'teleconsultation', 'pediatrician', 'BJ', true, 7, 'female',
    'Elle régurgite après chaque biberon.', interval '3 days');
  perform pg_temp.demo_progress(c, dossou, 'confirmed', now() - interval '1 day', true);

  c := pg_temp.demo_request(koffi, 'teleconsultation', 'pediatric_neurologist', 'TG', true, 30, 'male',
    'Suivi : il commence à associer deux mots.', interval '4 days');
  perform pg_temp.demo_progress(c, amegah, 'confirmed', now() - interval '2 days', true);

  -- ---------------------------------------------------------------------------
  -- Terminées et payées → gains des professionnels (dont un prix promotionnel)
  -- ---------------------------------------------------------------------------
  c := pg_temp.demo_request(rose, 'appointment', 'pediatrician', 'BJ', true, 12, 'male',
    'Vaccins du 12e mois et contrôle.', interval '20 days');
  perform pg_temp.demo_progress(c, dossou, 'completed', now() - interval '15 days', true);

  c := pg_temp.demo_request(afi, 'teleconsultation', 'pediatrician', 'BJ', true, 6, 'female',
    'Diversification alimentaire : par quoi commencer ?', interval '12 days');
  -- Payée moins cher que le tarif : geste commercial.
  perform pg_temp.demo_progress(c, dossou, 'completed', now() - interval '10 days', true,
    p_paid_amount => (select round(coalesce(price_amount, 5000) * 0.5) from public.consultations where id = c));

  -- Rose (pas Afi, qui a déjà une demande de généraliste en cours pour elle-même : la base refuserait le doublon).
  c := pg_temp.demo_request(rose, 'appointment', 'general_practitioner', 'BJ', false, null, null,
    'Douleurs au dos depuis la grossesse.', interval '25 days');
  perform pg_temp.demo_progress(c, akakpo, 'completed', now() - interval '20 days', true);

  c := pg_temp.demo_request(yao, 'appointment', 'pediatrician', 'TG', true, 3, 'female',
    'Premier rendez-vous de suivi.', interval '30 days');
  perform pg_temp.demo_progress(c, lawson, 'completed', now() - interval '28 days', true);

  c := pg_temp.demo_request(koffi, 'appointment', 'pediatric_neurologist', 'TG', true, 24, 'male',
    'Bilan du langage à 2 ans.', interval '40 days');
  perform pg_temp.demo_progress(c, amegah, 'completed', now() - interval '35 days', true);

  c := pg_temp.demo_request(aicha, 'appointment', 'general_practitioner', 'NE', false, null, null,
    'Fièvre et courbatures.', interval '18 days');
  perform pg_temp.demo_progress(c, harouna, 'completed', now() - interval '16 days', true);

  c := pg_temp.demo_request(fati, 'teleconsultation', 'general_practitioner', 'NE', true, 20, 'male',
    'Il refuse de manger depuis trois jours.', interval '8 days');
  perform pg_temp.demo_progress(c, harouna, 'completed', now() - interval '7 days', true);

  -- Terminée mais pas encore payée : pas de gain tant qu'elle n'est pas payée.
  c := pg_temp.demo_request(fati, 'appointment', 'general_practitioner', 'NE', true, 22, 'male',
    'Contrôle après la diarrhée.', interval '5 days');
  perform pg_temp.demo_progress(c, harouna, 'completed', now() - interval '3 days');

  -- ---------------------------------------------------------------------------
  -- Annulées et remboursée
  -- ---------------------------------------------------------------------------
  c := pg_temp.demo_request(rose, 'teleconsultation', 'pediatrician', 'BJ', true, 10, 'female',
    'Éruption après un nouveau savon.', interval '6 days');
  perform pg_temp.demo_progress(c, dossou, 'cancelled', now() + interval '1 day');

  c := pg_temp.demo_request(koffi, 'appointment', 'pediatrician', 'TG', true, 28, 'male',
    'Demande annulée par le parent.', interval '9 days');
  update public.consultations set status = 'cancelled', cancelled_at = now() - interval '8 days' where id = c;

  c := pg_temp.demo_request(yao, 'teleconsultation', 'pediatrician', 'TG', true, 15, 'male',
    'Toux sèche, consultation remboursée.', interval '7 days');
  perform pg_temp.demo_progress(c, lawson, 'confirmed', now() - interval '6 days', true);
  update public.consultations set payment_status = 'refunded', payment_reference = 'DEMO-REMBOURSEMENT' where id = c;

  -- ---------------------------------------------------------------------------
  -- Demandes de paiement : Dr Dossou en attente (à traiter par l'administrateur), Dr Lawson déjà payé
  -- ---------------------------------------------------------------------------
  insert into public.payout_requests (professional_id, amount, currency, method, payout_details, requested_at)
  select dossou, sum(net_amount), currency, 'mobile_money', 'MTN MoMo · +229 01 90 00 00 00', now() - interval '1 day'
  from public.professional_earnings where professional_id = dossou and payout_id is null
  group by currency
  returning id into payout;
  update public.professional_earnings set payout_id = payout where professional_id = dossou and payout_id is null;

  insert into public.payout_requests (professional_id, amount, currency, method, payout_details, status, requested_at, processed_at, reference)
  select lawson, sum(net_amount), currency, 'bank_transfer', 'Ecobank Togo · K. Lawson · TG053 01001 000000000000 00', 'paid',
         now() - interval '20 days', now() - interval '18 days', 'VIR-DEMO-0001'
  from public.professional_earnings where professional_id = lawson and payout_id is null
  group by currency
  returning id into payout;
  update public.professional_earnings set payout_id = payout where professional_id = lawson and payout_id is null;

  -- ---------------------------------------------------------------------------
  -- Fil d'actualité (auteurs renseignés ici : en SQL, la base ne les déduit pas de la connexion)
  -- ---------------------------------------------------------------------------
  declare
    post uuid;
    question uuid;
    dossou_user uuid := (select user_id from public.professionals where id = dossou);
    amegah_user uuid := (select user_id from public.professionals where id = amegah);
    dossou_avatar text := (select avatar_path from public.professionals where id = dossou);
    amegah_avatar text := (select avatar_path from public.professionals where id = amegah);
  begin
    insert into public.feed_posts (author_id, author_role, author_name, body, created_at)
    values (null, 'team', 'Équipe Petits Pas',
      '[Démo] Bienvenue sur le fil d’actualité ! Retrouvez ici des conseils de professionnels de santé, et posez vos questions sous chaque publication.',
      now() - interval '3 days');

    insert into public.feed_posts (author_id, author_role, author_name, author_detail, author_avatar_path, body, created_at)
    values (dossou_user, 'professional', 'Marc Dossou', 'Pédiatre', dossou_avatar,
      'Fièvre chez le nourrisson : avant 3 mois, toute fièvre (38 °C ou plus) doit amener à consulter rapidement. Après 3 mois, surveillez surtout son comportement : boit-il, joue-t-il, se réveille-t-il bien ?',
      now() - interval '1 day')
    returning id into post;
    insert into public.feed_comments (post_id, author_id, author_role, author_name, body, created_at)
    values (post, afi, 'parent', 'Afi A.', 'Et si la fièvre revient le soir pendant plusieurs jours ?', now() - interval '20 hours')
    returning id into question;
    insert into public.feed_comments (post_id, reply_to, author_id, author_role, author_name, author_detail, author_avatar_path, body, created_at)
    values (post, question, dossou_user, 'professional', 'Marc Dossou', 'Pédiatre', dossou_avatar,
      'Au-delà de 48 h de fièvre, même si elle baisse dans la journée, il faut le faire examiner : demandez une consultation.', now() - interval '18 hours');
    -- Question encore sans réponse (pour tester « Répondre » dans Petits Pas Pro).
    insert into public.feed_comments (post_id, author_id, author_role, author_name, body, created_at)
    values (post, rose, 'parent', 'Rose H.', 'Le paracétamol en suppositoire, c’est aussi efficace que le sirop ?', now() - interval '2 hours');

    insert into public.feed_posts (author_id, author_role, author_name, author_detail, author_avatar_path, body, created_at)
    values (amegah_user, 'professional', 'Sena Amegah', 'Neuropédiatre', amegah_avatar,
      'Le langage se construit dès la naissance : parlez à votre bébé pendant le bain, les repas, les promenades. Nommez ce que vous voyez, chantez, lisez des images. Ce n’est jamais trop tôt !',
      now() - interval '5 hours');

    insert into public.feed_posts (author_id, author_role, author_name, body, created_at)
    values (koffi, 'parent', 'Koffi M.',
      'Astuce de papa : on a mis une petite lampe orange pour les tétées de nuit, bébé se rendort beaucoup plus vite qu’avec la lumière blanche.',
      now() - interval '40 minutes');

    -- En attente de validation : visible seulement par son auteur et les administrateurs.
    insert into public.feed_posts (author_id, author_role, author_name, body, status, created_at)
    values (yao, 'parent', 'Yao A.',
      'Quelqu’un connaît une tisane pour calmer les coliques ? Ma voisine conseille de l’eau sucrée au miel.',
      'pending', now() - interval '15 minutes');
  end;

  -- ---------------------------------------------------------------------------
  -- Votre espace professionnel (si vous l'avez activé)
  -- ---------------------------------------------------------------------------
  if me is not null then
    -- Demandes à prendre dans votre spécialité et votre pays (dont une « pour le parent » si possible).
    perform pg_temp.demo_request(afi, 'teleconsultation', my_specialty, my_country, true, 11, 'male',
      '[Pour vous] Il a de la fièvre et refuse le biberon depuis ce matin.', interval '45 minutes', interval '6 hours');
    perform pg_temp.demo_request(rose, 'appointment', my_specialty, my_country, true, 30, 'female',
      '[Pour vous] Elle boite légèrement depuis une chute au jardin.', interval '1 day', interval '2 days');

    -- Consultations à vous : aujourd'hui, demain, payées (messagerie), terminées (comptabilité).
    c := pg_temp.demo_request(yao, 'appointment', my_specialty, my_country, true, 8, 'female',
      '[Pour vous] Contrôle des 8 mois.', interval '2 days');
    perform pg_temp.demo_progress(c, me, 'confirmed', date_trunc('hour', now()) + interval '2 hours');

    c := pg_temp.demo_request(koffi, 'teleconsultation', my_specialty, my_country, true, 20, 'male',
      '[Pour vous] Questions sur le sommeil.', interval '3 days');
    perform pg_temp.demo_progress(c, me, 'confirmed', date_trunc('hour', now()) + interval '1 day 9 hours', true);

    c := pg_temp.demo_request(aicha, 'appointment', my_specialty, my_country, true, 15, 'male',
      '[Pour vous] Suivi après otite.', interval '15 days');
    perform pg_temp.demo_progress(c, me, 'completed', now() - interval '12 days', true);

    c := pg_temp.demo_request(fati, 'teleconsultation', my_specialty, my_country, true, 5, 'female',
      '[Pour vous] Allaitement et prise de poids.', interval '9 days');
    perform pg_temp.demo_progress(c, me, 'completed', now() - interval '8 days', true);

    raise notice 'Données de démo créées, dont des consultations pour votre fiche professionnelle (% · %).', my_specialty, my_country;
  else
    raise notice 'Données de démo créées. Activez votre espace professionnel puis relancez ce script pour avoir aussi des consultations à vous.';
  end if;
end;
$$;

commit;

-- Récapitulatif
select 'Parents' as quoi, count(*) as nombre from public.parents p join auth.users u on u.id = p.id where u.email like '%@demo.petitspas.test'
union all select 'Professionnels', count(*) from public.professionals where email like '%@demo.petitspas.test'
union all select 'Consultations', count(*) from public.consultations where parent_id in (select id from auth.users where email like '%@demo.petitspas.test')
union all select 'Conversations ouvertes', count(*) from public.conversations where parent_id in (select id from auth.users where email like '%@demo.petitspas.test')
union all select 'Gains', count(*) from public.professional_earnings e join public.consultations c on c.id = e.consultation_id where c.parent_id in (select id from auth.users where email like '%@demo.petitspas.test')
union all select 'Demandes de paiement', count(*) from public.payout_requests r join public.professionals p on p.id = r.professional_id where p.email like '%@demo.petitspas.test'
union all select 'Promotions [Démo]', count(*) from public.promotions where name like '[Démo]%';
