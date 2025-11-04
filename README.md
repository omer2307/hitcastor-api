# Hitcastor API

REST API for Hitcastor prediction markets that orchestrates the complete resolution flow and serves market data to web applications.

## Overview

The Hitcastor API provides a comprehensive backend service for prediction markets based on Spotify chart rankings. It manages the complete lifecycle from market creation to resolution through a secure commit-reveal scheme.

### Key Features

- **Market Management**: List and retrieve market data with real-time pricing
- **Evidence Verification**: Fetch and verify Spotify chart snapshots using SHA256 hashes
- **Resolution Flow**: Complete prepare → commit → dispute → finalize workflow
- **Blockchain Integration**: Secure on-chain resolution using viem and commit-reveal schemes
- **Background Processing**: Automated job queues with BullMQ for reliable execution
- **OpenAPI Documentation**: Complete API documentation with interactive Swagger UI
- **Authentication**: Admin API key protection for mutation operations

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Frontend  │    │  Hitcastor API  │    │   Blockchain    │
│                 │    │                 │    │                 │
│  - Market List  │◄──►│  - REST Routes  │◄──►│  - Resolver     │
│  - Trading UI   │    │  - Auth Guard   │    │  - Factory      │
│  - Evidence     │    │  - Validation   │    │  - AMM Pools    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │   PostgreSQL    │
                       │                 │
                       │  - Markets      │
                       │  - Snapshots    │
                       │  - Resolutions  │
                       └─────────────────┘
                                │
                       ┌─────────────────┐
                       │   Redis/BullMQ  │
                       │                 │
                       │  - Job Queues   │
                       │  - Scheduling   │
                       │  - Retries      │
                       └─────────────────┘
```

## Resolution Flow

The API implements a secure 3-phase resolution process:

### 1. Prepare Phase
- Fetch t0 (initial) and t1 (final) Spotify chart snapshots
- Verify SHA256 hashes for data integrity
- Extract song rankings from JSON data
- Compute outcome: YES if rank improved (t1 < t0), NO otherwise
- Store resolution data in database

### 2. Commit Phase
- Build cryptographic commitment using keccak256
- Submit commitment to Resolver contract on-chain
- Start dispute window (configurable duration)
- Schedule finalization job after dispute period

### 3. Finalize Phase
- Wait for dispute window to expire
- Submit final resolution with evidence to blockchain
- Update market status to RESOLVED
- Enable token redemption for winners

## API Endpoints

### Core Routes

- `GET /health` - Service health and chain info
- `GET /markets` - List markets with pricing data
- `GET /markets/:id` - Market details with reserves
- `GET /markets/:id/evidence` - Evidence URLs and resolution status

### Admin Routes (require X-Admin-Key header)

- `POST /markets/:id/prepare-resolve` - Prepare resolution with evidence
- `POST /markets/:id/commit` - Commit resolution to blockchain
- `POST /markets/:id/finalize` - Finalize after dispute window

### Documentation

- `GET /docs` - Interactive Swagger UI
- `GET /openapi.json` - OpenAPI specification

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Redis instance
- Blockchain RPC endpoint

### Installation

```bash
# Clone and install dependencies
git clone <repository>
cd hitcastor-api
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
pnpm migrate

# Start the server
pnpm dev
```

### Development Commands

```bash
pnpm dev          # Start with hot reload
pnpm build        # Build TypeScript
pnpm start        # Start production server
pnpm worker       # Run background workers only
pnpm test         # Run all tests
pnpm test:e2e     # Run E2E tests only
pnpm migrate      # Apply database migrations
pnpm docs         # Open API documentation
```

## Configuration

### Environment Variables

#### HTTP Server
- `PORT` - Server port (default: 8080)
- `ADMIN_API_KEY` - Secret key for admin operations
- `CORS_ORIGIN` - Allowed CORS origin

#### Database & Cache
- `PG_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string

#### Blockchain
- `RPC_URL` - Blockchain RPC endpoint
- `CHAIN_ID` - Network chain ID
- `RESOLVER_ADDRESS` - Resolver contract address
- `FACTORY_ADDRESS` - Market factory address
- `TREASURY_ADDRESS` - Treasury address
- `PRIVATE_KEY` - Wallet private key for transactions

#### Optional Features
- `SLACK_WEBHOOK_URL` - Slack alerts for job failures
- Object store config for evidence re-uploads

### Database Schema

```sql
-- Markets created by factory or discovered
CREATE TABLE markets (
  market_id BIGINT PRIMARY KEY,
  song_id BIGINT NOT NULL,
  title TEXT,
  artist TEXT,
  quote_token TEXT NOT NULL,
  amm_address BYTEA NOT NULL,
  yes_token BYTEA NOT NULL,
  no_token BYTEA NOT NULL,
  t0_rank SMALLINT NOT NULL,
  cutoff_utc TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'OPEN'
);

-- Evidence snapshots from snapshotter service
CREATE TABLE snapshots (
  id BIGSERIAL PRIMARY KEY,
  date_utc DATE NOT NULL,
  region TEXT NOT NULL,
  json_url TEXT NOT NULL,
  json_sha256 TEXT NOT NULL,
  csv_url TEXT,
  ipfs_cid TEXT
);

-- Resolution lifecycle tracking
CREATE TABLE resolutions (
  market_id BIGINT PRIMARY KEY,
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
```

## Background Jobs

The API uses BullMQ for reliable background processing:

### Job Types

1. **prepareResolve** - Fetch evidence and compute outcomes
2. **commitResolve** - Submit commitments to blockchain
3. **finalizeResolve** - Complete resolution after dispute window

### Job Features

- **Idempotency** - Jobs can be safely retried
- **Exponential Backoff** - Automatic retry with increasing delays
- **Error Handling** - Slack alerts for failures
- **Monitoring** - Job status tracking and logs

## Security

### Authentication
- Admin routes protected with `X-Admin-Key` header
- No public write access to resolution endpoints

### Data Integrity
- SHA256 verification of all evidence data
- Cryptographic commitments prevent manipulation
- Blockchain immutability for final resolutions

### Error Handling
- Input validation with Zod schemas
- Graceful failure handling with meaningful errors
- Comprehensive logging for debugging

## Testing

### Unit Tests
```bash
pnpm test src/test/resolve.unit.test.ts
```
Tests outcome computation, rank extraction, and hash verification.

### E2E Tests
```bash
pnpm test:e2e
```
Tests complete API flows with real server instance.

### Test Coverage
```bash
pnpm test:coverage
```

## Deployment

### Production Checklist

- [ ] Set strong `ADMIN_API_KEY`
- [ ] Configure database connection pooling
- [ ] Set up Redis persistence
- [ ] Configure blockchain wallet/KMS
- [ ] Set up monitoring and alerting
- [ ] Configure CORS for production domain
- [ ] Set up SSL/TLS termination
- [ ] Configure log aggregation

### Docker Deployment
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 8080
CMD ["pnpm", "start"]
```

## API Examples

### List Markets
```bash
curl http://localhost:8080/markets
```

### Get Market Details
```bash
curl http://localhost:8080/markets/1
```

### Prepare Resolution (Admin)
```bash
curl -X POST http://localhost:8080/markets/1/prepare-resolve \
  -H "X-Admin-Key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{
    "t0Url": "https://example.com/t0.json",
    "t0Sha": "0x...",
    "t1Url": "https://example.com/t1.json", 
    "t1Sha": "0x..."
  }'
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit pull request

## License

MIT