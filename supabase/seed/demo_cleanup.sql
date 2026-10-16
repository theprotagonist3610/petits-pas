-- =============================================================================
-- Petits Pas — suppression des données fictives créées par supabase/seed/demo.sql
-- =============================================================================
-- Retire les comptes @demo.petitspas.test, leurs consultations (et historiques, conversations),
-- les gains et demandes de paiement liés, et les promotions « [Démo] ».
-- Les tarifs ne sont pas retirés : ils ont pu être ajustés depuis, vérifiez-les dans Paramètres › Plateforme.

begin;

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

commit;
