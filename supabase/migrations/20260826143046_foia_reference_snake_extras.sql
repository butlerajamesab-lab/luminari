-- Snake-case feature columns the app schema tracks (fee waiver, expedited, appeal days, submission methods, notes).
ALTER TABLE foia_statutes
  ADD COLUMN IF NOT EXISTS fee_waiver_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expedited_processing_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS appeal_deadline_days integer;
UPDATE foia_statutes SET expedited_processing_available = true WHERE state_code = 'US';
UPDATE foia_statutes SET appeal_deadline_days = 90 WHERE state_code = 'US';

ALTER TABLE foia_agencies
  ADD COLUMN IF NOT EXISTS submission_methods varchar(8) NOT NULL DEFAULT 'mixed' CHECK (submission_methods IN ('portal','email','mail','mixed')),
  ADD COLUMN IF NOT EXISTS notes text;
UPDATE foia_agencies SET submission_methods = CASE
  WHEN submission_portal IS NOT NULL AND email IS NOT NULL THEN 'mixed'
  WHEN submission_portal IS NOT NULL THEN 'portal'
  WHEN email IS NOT NULL THEN 'email'
  ELSE 'mail' END;
