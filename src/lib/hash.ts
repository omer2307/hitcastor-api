import crypto from 'crypto'

export function sha256(input: string | Buffer): string {
  const hash = crypto.createHash('sha256')
  hash.update(input)
  return '0x' + hash.digest('hex')
}

export function verifyHash(data: string | Buffer, expectedHash: string): boolean {
  const computedHash = sha256(data)
  return computedHash.toLowerCase() === expectedHash.toLowerCase()
}

export async function fetchAndVerifyHash(url: string, expectedHash: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  
  const buffer = Buffer.from(await response.arrayBuffer())
  
  if (!verifyHash(buffer, expectedHash)) {
    throw new Error(`Hash verification failed for ${url}. Expected: ${expectedHash}, Got: ${sha256(buffer)}`)
  }
  
  return buffer
}