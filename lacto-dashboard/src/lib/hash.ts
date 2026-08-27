/**
 * cyrb53 — hash string rapid, sincron, cu risc de coliziune foarte scăzut.
 * Folosit pentru semnătura rândurilor și a importurilor (spec §12), NU pentru
 * securitate criptografică.
 */
function cyrb53Bytes(bytes: ArrayLike<number>, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i]
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function cyrb53(str: string, seed = 0): string {
  const bytes = new Uint16Array(str.length)
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i)
  return cyrb53Bytes(bytes, seed)
}

/** Hash rapid al conținutului brut al unui fișier (bytes), pentru detectarea "același fișier reîncărcat". */
export function hashArrayBuffer(buffer: ArrayBuffer): string {
  return cyrb53Bytes(new Uint8Array(buffer))
}

export function rowSignature(fields: (string | number | null | undefined)[]): string {
  return cyrb53(fields.map((f) => (f === null || f === undefined ? '' : String(f))).join('|'))
}

/** Semnătură de fișier bazată pe hash-urile rândurilor, insensibilă la ordinea rândurilor. */
export function fileSignature(sourceFileType: string, rowHashes: string[]): string {
  const sorted = [...rowHashes].sort()
  return cyrb53(`${sourceFileType}:${sorted.length}:${sorted.join(',')}`)
}
