#!/usr/bin/env tsx
import { pool } from '../src/db/index.js'

async function addMarket() {
  const marketData = {
    market_id: 0, // First market created
    song_id: 1234567890,
    title: 'Test Song - BSC Testnet',
    artist: 'Test Artist',
    quote_token: '0x0000000000000000000000000000000000000000',
    amm_address: Buffer.from('c89f383D692017cF1dfcDc14904dB64FeA559589', 'hex'),
    yes_token: Buffer.from('e94653c5b3992a2dfc7b3c2ccb1b830d1fe007f1', 'hex'),
    no_token: Buffer.from('1dd1b2794a5d7c4e504eb04446fc3675f2eab2ca', 'hex'),
    t0_rank: 12,
    cutoff_utc: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    status: 'OPEN'
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO markets (
        market_id, song_id, title, artist, quote_token, 
        amm_address, yes_token, no_token, t0_rank, cutoff_utc, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) 
      ON CONFLICT (market_id) DO UPDATE SET
        title = EXCLUDED.title,
        artist = EXCLUDED.artist
      RETURNING *
    `, [
      marketData.market_id,
      marketData.song_id,
      marketData.title,
      marketData.artist,
      marketData.quote_token,
      marketData.amm_address,
      marketData.yes_token,
      marketData.no_token,
      marketData.t0_rank,
      marketData.cutoff_utc,
      marketData.status
    ])

    console.log('Market added successfully:', rows[0])
  } catch (error) {
    console.error('Error adding market:', error)
  } finally {
    await pool.end()
  }
}

addMarket()