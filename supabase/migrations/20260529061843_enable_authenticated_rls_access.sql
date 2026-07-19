
-- Create permissive RLS policy for authenticated users on all tables with RLS enabled
-- This allows authenticated users to read all rows (same as service_role behavior)

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN 
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE pg_policies.tablename = pg_tables.tablename 
      AND schemaname = 'public'
    )
  LOOP
    -- Check if policy already exists for authenticated role
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = t.tablename 
      AND roles::text LIKE '%authenticated%'
    ) THEN
      EXECUTE format('
        CREATE POLICY authenticated_all_access_%s ON %I
        FOR SELECT
        TO authenticated
        USING (true)',
        t.tablename,
        t.tablename
      );
    END IF;
  END LOOP;
END $$;
