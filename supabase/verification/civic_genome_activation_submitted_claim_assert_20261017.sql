-- Run ONLY in disposable PostgreSQL after the original quarantine and
-- civic_genome_activation_submitted_claim_fence_20261017.sql are installed.
-- A failing expectation MUST raise; do not accept SQLSTATE 23514 instead of
-- the deterministic 55000 quarantine rejection.
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_rosetta_generation_activation_queue SET queue_state=''submitted'' WHERE id=1');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_rosetta_generation_activation_queue SET queue_state=''submitted'' WHERE id=2');
SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_rosetta_generation_activation_queue(id,queue_state) VALUES (11,''submitted'')');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_rosetta_generation_activation_queue SET queue_state=''completed'' WHERE id=1');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_rosetta_generation_upgrade_queue SET queue_state=''running'' WHERE id=1');
SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_rosetta_generation_upgrade_queue(id,queue_state) VALUES (11,''running'')');
-- Source-only queue registration and cleanup can still proceed.
INSERT INTO public.civic_genome_rosetta_generation_activation_queue(id,queue_state)
  VALUES (12,'eligible');
UPDATE public.civic_genome_rosetta_generation_activation_queue
   SET queue_state='failed' WHERE id=2;
UPDATE public.civic_genome_rosetta_generation_upgrade_queue
   SET queue_state='dead_letter' WHERE id=1;
DO $verify$
BEGIN
  IF (SELECT queue_state FROM public.civic_genome_rosetta_generation_activation_queue WHERE id=2) IS DISTINCT FROM 'failed'
     OR (SELECT queue_state FROM public.civic_genome_rosetta_generation_upgrade_queue WHERE id=1) IS DISTINCT FROM 'dead_letter'
     OR (SELECT count(*) FROM public.civic_genome_rosetta_generation_activation_queue WHERE id=12 AND queue_state='eligible') <> 1
  THEN
    RAISE EXCEPTION 'source metadata and cleanup blocked';
  END IF;
END;
$verify$;
