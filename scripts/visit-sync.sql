-- Run atomically before deploying the incremental sync API. Existing visits remain intact.
BEGIN;
LOCK TABLE public.chaxter_visits, public.chaxter_corrections IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.chaxter_sync_state (
  id integer PRIMARY KEY CHECK (id = 1),
  epoch uuid NOT NULL DEFAULT gen_random_uuid(),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO public.chaxter_sync_state(id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.chaxter_visits ADD COLUMN IF NOT EXISTS sync_revision bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS chaxter_visits_sync_revision ON public.chaxter_visits(sync_revision);

-- Acquire the shared revision lock BEFORE locking visit/correction rows. Unlike a
-- sequence, this transactional counter cannot publish revisions out of commit order.
CREATE OR REPLACE FUNCTION public.chaxter_advance_sync() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.chaxter_sync_state SET revision = revision + 1 WHERE id = 1;
  RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION public.chaxter_stamp_visit() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.sync_revision := (SELECT revision FROM public.chaxter_sync_state WHERE id = 1);
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.chaxter_stamp_correction_visit() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.chaxter_visits SET sync_revision = sync_revision WHERE id = NEW.visit_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chaxter_visits_sync_lock ON public.chaxter_visits;
CREATE TRIGGER chaxter_visits_sync_lock BEFORE INSERT OR UPDATE ON public.chaxter_visits
  FOR EACH STATEMENT EXECUTE FUNCTION public.chaxter_advance_sync();
DROP TRIGGER IF EXISTS chaxter_visits_sync_stamp ON public.chaxter_visits;
CREATE TRIGGER chaxter_visits_sync_stamp BEFORE INSERT OR UPDATE ON public.chaxter_visits
  FOR EACH ROW EXECUTE FUNCTION public.chaxter_stamp_visit();
DROP TRIGGER IF EXISTS chaxter_corrections_sync_lock ON public.chaxter_corrections;
CREATE TRIGGER chaxter_corrections_sync_lock BEFORE INSERT OR UPDATE ON public.chaxter_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION public.chaxter_advance_sync();
DROP TRIGGER IF EXISTS chaxter_corrections_sync_stamp ON public.chaxter_corrections;
CREATE TRIGGER chaxter_corrections_sync_stamp AFTER INSERT OR UPDATE ON public.chaxter_corrections
  FOR EACH ROW EXECUTE FUNCTION public.chaxter_stamp_correction_visit();
COMMIT;
