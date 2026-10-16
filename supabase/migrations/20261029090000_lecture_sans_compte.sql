-- Correctif : lecture du fil d'actualité et des promotions sans compte.
--
-- Les politiques de lecture ouvertes à tous (« publié, OU administrateur ») appellent is_admin().
-- Ce droit d'exécution avait été retiré au rôle anon : la base refusait alors TOUTE la lecture
-- (« permission denied for function is_admin ») au lieu de répondre simplement « pas administrateur ».
--
-- Sans risque : pour un visiteur sans compte, is_admin() renvoie toujours false
-- (pas d'utilisateur, donc ni double authentification ni ligne dans admins).

grant execute on function public.is_admin() to anon;
