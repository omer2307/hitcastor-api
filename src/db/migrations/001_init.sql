-- markets created by deploy/seed or discovered from chain
CREATE TABLE IF NOT EXISTS markets (
  id BIGSERIAL PRIMARY KEY,
  market_id BIGINT UNIQUE NOT NULL,   -- on-chain id
  song_id BIGINT NOT NULL,
  title TEXT,
  artist TEXT,
  quote_token TEXT NOT NULL,
  amm_address BYTEA NOT NULL,
  yes_token BYTEA NOT NULL,
  no_token BYTEA NOT NULL,
  t0_rank SMALLINT NOT NULL,
  cutoff_utc TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- snapshots written by snapshotter
CREATE TABLE IF NOT EXISTS snapshots (
  id BIGSERIAL PRIMARY KEY,
  date_utc DATE NOT NULL,
  region TEXT NOT NULL,
  json_url TEXT NOT NULL,
  json_sha256 TEXT NOT NULL,
  csv_url TEXT,
  csv_sha256 TEXT,
  ipfs_cid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(date_utc, region)
);

-- link a market to its t0/t1 evidence + outcome lifecycle
CREATE TABLE IF NOT EXISTS resolutions (
  market_id BIGINT PRIMARY KEY REFERENCES markets(market_id),
  t0_snapshot_id BIGINT REFERENCES snapshots(id),
  t1_snapshot_id BIGINT REFERENCES snapshots(id),
  t0_rank SMALLINT,
  t1_rank SMALLINT,
  outcome SMALLINT, -- 1=YES, 2=NO
  commit_tx TEXT,
  committed_at TIMESTAMPTZ,
  dispute_until TIMESTAMPTZ,
  finalize_tx TEXT,
  finalized_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_cutoff ON markets(cutoff_utc);
CREATE INDEX IF NOT EXISTS idx_snapshots_date_region ON snapshots(date_utc, region);
CREATE INDEX IF NOT EXISTS idx_resolutions_dispute_until ON resolutions(dispute_until) WHERE finalized_at IS NULL;