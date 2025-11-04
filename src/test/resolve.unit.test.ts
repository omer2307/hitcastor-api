import { describe, it, expect } from 'vitest'
import { extractRankBySongId, computeOutcome, validateSnapshotSchema } from '../lib/rank.js'
import { sha256, verifyHash } from '../lib/hash.js'

describe('rank extraction and outcome computation', () => {
  const mockSnapshot = {
    schema: 'hitcastor.spotify.top100.v1',
    dateUTC: '2024-01-15',
    region: 'global',
    provider: 'spotify',
    listLength: 3,
    items: [
      {
        rank: 1,
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        streams: 1234567,
        trackId: 'spotify:track:0VjIjW4GlULA',
        spotifyUrl: 'https://open.spotify.com/track/0VjIjW4GlULA'
      },
      {
        rank: 2,
        title: 'Shape of You',
        artist: 'Ed Sheeran',
        streams: 987654,
        trackId: 'spotify:track:7qiZfU4dY4WnASrxmjMzxQ',
        spotifyUrl: 'https://open.spotify.com/track/7qiZfU4dY4WnASrxmjMzxQ'
      },
      {
        rank: 3,
        title: 'Someone You Loved',
        artist: 'Lewis Capaldi',
        streams: 876543,
        trackId: 'spotify:track:7qEHsqek33rTcFNT9PFqLf',
        spotifyUrl: 'https://open.spotify.com/track/7qEHsqek33rTcFNT9PFqLf'
      }
    ]
  }

  describe('extractRankBySongId', () => {
    it('should extract rank for existing song by track ID', () => {
      const rank = extractRankBySongId(mockSnapshot, '0VjIjW4GlULA')
      expect(rank).toBe(1)
    })

    it('should extract rank for existing song by full URI', () => {
      const rank = extractRankBySongId(mockSnapshot, 'spotify:track:7qiZfU4dY4WnASrxmjMzxQ')
      expect(rank).toBe(2)
    })

    it('should return 101 for non-existent song', () => {
      const rank = extractRankBySongId(mockSnapshot, 'nonexistent-track-id')
      expect(rank).toBe(101)
    })

    it('should handle mixed URI formats', () => {
      const rank1 = extractRankBySongId(mockSnapshot, 'spotify:track:7qEHsqek33rTcFNT9PFqLf')
      const rank2 = extractRankBySongId(mockSnapshot, '7qEHsqek33rTcFNT9PFqLf')
      expect(rank1).toBe(3)
      expect(rank2).toBe(3)
    })
  })

  describe('computeOutcome', () => {
    it('should return YES (1) when rank improves', () => {
      const outcome = computeOutcome(5, 3) // Improved from 5 to 3
      expect(outcome).toBe(1)
    })

    it('should return NO (2) when rank stays same', () => {
      const outcome = computeOutcome(5, 5)
      expect(outcome).toBe(2)
    })

    it('should return NO (2) when rank gets worse', () => {
      const outcome = computeOutcome(3, 5) // Got worse from 3 to 5
      expect(outcome).toBe(2)
    })

    it('should return NO (2) when song is absent (rank 101)', () => {
      const outcome = computeOutcome(50, 101) // Song dropped out of top 100
      expect(outcome).toBe(2)
    })

    it('should return YES (1) when song enters top 100 from absent', () => {
      const outcome = computeOutcome(101, 50) // Song entered top 100
      expect(outcome).toBe(1)
    })

    it('should handle edge case of rank 1', () => {
      const outcome1 = computeOutcome(2, 1) // Improved to #1
      const outcome2 = computeOutcome(1, 2) // Dropped from #1
      expect(outcome1).toBe(1)
      expect(outcome2).toBe(2)
    })
  })

  describe('validateSnapshotSchema', () => {
    it('should validate correct snapshot schema', () => {
      const isValid = validateSnapshotSchema(mockSnapshot)
      expect(isValid).toBe(true)
    })

    it('should reject invalid schema version', () => {
      const invalidSnapshot = { ...mockSnapshot, schema: 'wrong.schema.v1' }
      const isValid = validateSnapshotSchema(invalidSnapshot)
      expect(isValid).toBe(false)
    })

    it('should reject missing required fields', () => {
      const { schema, ...invalidSnapshot } = mockSnapshot
      const isValid = validateSnapshotSchema(invalidSnapshot)
      expect(isValid).toBe(false)
    })

    it('should reject invalid item structure', () => {
      const invalidSnapshot = {
        ...mockSnapshot,
        items: [{ rank: 'not-a-number', title: 'Test' }]
      }
      const isValid = validateSnapshotSchema(invalidSnapshot)
      expect(isValid).toBe(false)
    })

    it('should reject non-array items', () => {
      const invalidSnapshot = { ...mockSnapshot, items: 'not-an-array' }
      const isValid = validateSnapshotSchema(invalidSnapshot)
      expect(isValid).toBe(false)
    })
  })
})

describe('hash utilities', () => {
  describe('sha256', () => {
    it('should generate consistent hashes', () => {
      const input = 'test data'
      const hash1 = sha256(input)
      const hash2 = sha256(input)
      
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should handle Buffer input', () => {
      const buffer = Buffer.from('test data')
      const hash = sha256(buffer)
      
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should produce known hash for known input', () => {
      const input = 'hello world'
      const expectedHash = '0xb94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
      
      expect(sha256(input)).toBe(expectedHash)
    })
  })

  describe('verifyHash', () => {
    it('should verify correct hashes', () => {
      const data = 'test data'
      const hash = sha256(data)
      
      expect(verifyHash(data, hash)).toBe(true)
    })

    it('should reject incorrect hashes', () => {
      const data = 'test data'
      const wrongHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      
      expect(verifyHash(data, wrongHash)).toBe(false)
    })

    it('should be case insensitive', () => {
      const data = 'test data'
      const hash = sha256(data)
      const upperHash = hash.toUpperCase()
      
      expect(verifyHash(data, upperHash)).toBe(true)
    })
  })
})