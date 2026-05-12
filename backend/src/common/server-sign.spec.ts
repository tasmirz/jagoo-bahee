import { createProofHash, signProofHash, verifyProofHash, verifySignedProof } from './server-sign.util'

describe('server proof signing', () => {
  it('verifies signed post proof hashes and rejects tampering', () => {
    const proofHash = createProofHash('user-1', 'post-1')
    const signature = signProofHash(proofHash)

    expect(verifyProofHash('user-1', 'post-1', proofHash)).toBe(true)
    expect(verifySignedProof(proofHash, signature)).toBe(true)
    expect(verifyProofHash('user-1', 'post-2', proofHash)).toBe(false)
    expect(verifySignedProof(createProofHash('user-1', 'post-2'), signature)).toBe(false)
  })
})
