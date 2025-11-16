DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resolutions' AND column_name='t0_url') THEN
    ALTER TABLE resolutions ADD COLUMN t0_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resolutions' AND column_name='t1_url') THEN
    ALTER TABLE resolutions ADD COLUMN t1_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resolutions' AND column_name='t0_sha') THEN
    ALTER TABLE resolutions ADD COLUMN t0_sha bytea;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resolutions' AND column_name='t1_sha') THEN
    ALTER TABLE resolutions ADD COLUMN t1_sha bytea;
  END IF;
END$$;
