export interface SpotifySnapshot {
  schema: string
  dateUTC: string
  region: string
  provider: string
  listLength: number
  items: Array<{
    rank: number
    title: string
    artist: string
    streams: number
    trackId: string
    spotifyUrl: string
  }>
}

export function extractRankBySongId(snapshot: SpotifySnapshot, songId: string): number {
  // songId could be a Spotify track ID or URI
  // Handle both formats: "spotify:track:abc123" and "abc123"
  const cleanSongId = songId.replace('spotify:track:', '')
  
  for (const item of snapshot.items) {
    const itemTrackId = item.trackId.replace('spotify:track:', '')
    if (itemTrackId === cleanSongId) {
      return item.rank
    }
  }
  
  // If song not found in snapshot, treat as rank 101 (worse than top 100)
  return 101
}

export function computeOutcome(t0Rank: number, t1Rank: number): number {
  // Outcome rules:
  // YES (1) = rank improved (t1 < t0)
  // NO (2) = rank stayed same or got worse (t1 >= t0)
  // Absent at t1 → rank 101 → NO
  
  if (t1Rank < t0Rank) {
    return 1 // YES
  } else {
    return 2 // NO
  }
}

export function validateSnapshotSchema(data: any): data is SpotifySnapshot {
  return (
    typeof data === 'object' &&
    data.schema === 'hitcastor.spotify.top100.v1' &&
    typeof data.dateUTC === 'string' &&
    typeof data.region === 'string' &&
    typeof data.provider === 'string' &&
    typeof data.listLength === 'number' &&
    Array.isArray(data.items) &&
    data.items.every((item: any) => 
      typeof item.rank === 'number' &&
      typeof item.title === 'string' &&
      typeof item.artist === 'string' &&
      typeof item.streams === 'number' &&
      typeof item.trackId === 'string' &&
      typeof item.spotifyUrl === 'string'
    )
  )
}