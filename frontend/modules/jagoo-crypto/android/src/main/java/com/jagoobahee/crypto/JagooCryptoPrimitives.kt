package com.jagoobahee.crypto

import java.security.SecureRandom
import org.bouncycastle.crypto.AsymmetricCipherKeyPair
import org.bouncycastle.crypto.digests.SHA256Digest
import org.bouncycastle.crypto.digests.SHA512Digest
import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.generators.HKDFBytesGenerator
import org.bouncycastle.crypto.generators.PKCS5S2ParametersGenerator
import org.bouncycastle.crypto.generators.SCrypt
import org.bouncycastle.crypto.macs.HMac
import org.bouncycastle.crypto.modes.ChaCha20Poly1305
import org.bouncycastle.crypto.params.AEADParameters
import org.bouncycastle.crypto.params.Argon2Parameters
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.params.HKDFParameters
import org.bouncycastle.crypto.params.KeyParameter
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.bouncycastle.crypto.params.X25519PublicKeyParameters
import org.bouncycastle.crypto.prng.FixedSecureRandom
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.bouncycastle.pqc.crypto.mldsa.MLDSAKeyGenerationParameters
import org.bouncycastle.pqc.crypto.mldsa.MLDSAKeyPairGenerator
import org.bouncycastle.pqc.crypto.mldsa.MLDSAParameters
import org.bouncycastle.pqc.crypto.mldsa.MLDSAPrivateKeyParameters
import org.bouncycastle.pqc.crypto.mldsa.MLDSAPublicKeyParameters
import org.bouncycastle.pqc.crypto.mldsa.MLDSASigner
import org.bouncycastle.pqc.crypto.mlkem.MLKEMExtractor
import org.bouncycastle.pqc.crypto.mlkem.MLKEMGenerator
import org.bouncycastle.pqc.crypto.mlkem.MLKEMKeyGenerationParameters
import org.bouncycastle.pqc.crypto.mlkem.MLKEMKeyPairGenerator
import org.bouncycastle.pqc.crypto.mlkem.MLKEMParameters
import org.bouncycastle.pqc.crypto.mlkem.MLKEMPrivateKeyParameters
import org.bouncycastle.pqc.crypto.mlkem.MLKEMPublicKeyParameters

/**
 * Android implementation of the primitive-only CryptoBackend contract.
 *
 * No envelope, identity, BIP-39 or BIP-85 semantics live here. Kotlin computes primitives;
 * the shared SDK remains the sole owner of byte meaning. Every deterministic input is kept
 * deterministic so the on-device suite can compare this implementation byte-for-byte with JS.
 */
internal class JagooCryptoPrimitives {
  private val secureRandom = SecureRandom()

  fun randomBytes(length: Int): ByteArray {
    require(length in 0..MAX_OUTPUT) { "random byte length is outside the supported range" }
    return ByteArray(length).also(secureRandom::nextBytes)
  }

  fun sha256(data: ByteArray): ByteArray = digest(SHA256Digest(), data)

  fun sha512(data: ByteArray): ByteArray = digest(SHA512Digest(), data)

  fun hmacSha512(key: ByteArray, data: ByteArray): ByteArray {
    val mac = HMac(SHA512Digest())
    mac.init(KeyParameter(key))
    mac.update(data, 0, data.size)
    return ByteArray(mac.macSize).also { mac.doFinal(it, 0) }
  }

  fun hkdfSha256(
    ikm: ByteArray,
    salt: ByteArray?,
    info: ByteArray,
    length: Int,
  ): ByteArray {
    requireOutput(length)
    val generator = HKDFBytesGenerator(SHA256Digest())
    generator.init(HKDFParameters(ikm, salt, info))
    return ByteArray(length).also { generator.generateBytes(it, 0, length) }
  }

  fun pbkdf2Sha512(
    password: ByteArray,
    salt: ByteArray,
    iterations: Int,
    length: Int,
  ): ByteArray {
    require(iterations > 0) { "PBKDF2 iterations must be positive" }
    requireOutput(length)
    val generator = PKCS5S2ParametersGenerator(SHA512Digest())
    generator.init(password, salt, iterations)
    return (generator.generateDerivedMacParameters(length * 8) as KeyParameter).key
  }

  fun scrypt(
    password: ByteArray,
    salt: ByteArray,
    n: Int,
    r: Int,
    p: Int,
    length: Int,
  ): ByteArray {
    requireOutput(length)
    return SCrypt.generate(password, salt, n, r, p, length)
  }

  fun argon2id(
    password: ByteArray,
    salt: ByteArray,
    memoryKiB: Int,
    iterations: Int,
    parallelism: Int,
    length: Int,
  ): ByteArray {
    require(memoryKiB >= 8) { "Argon2 memory must be at least 8 KiB" }
    require(iterations > 0 && parallelism > 0) { "Argon2 work factors must be positive" }
    requireOutput(length)
    val parameters = Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
      .withSalt(salt)
      .withMemoryAsKB(memoryKiB)
      .withIterations(iterations)
      .withParallelism(parallelism)
      .build()
    return ByteArray(length).also { output ->
      Argon2BytesGenerator().apply { init(parameters) }.generateBytes(password, output)
    }
  }

  fun ed25519PublicKey(seed: ByteArray): ByteArray {
    requireSize(seed, 32, "Ed25519 seed")
    return Ed25519PrivateKeyParameters(seed, 0).generatePublicKey().encoded
  }

  fun ed25519Sign(message: ByteArray, seed: ByteArray): ByteArray {
    requireSize(seed, 32, "Ed25519 seed")
    val signer = Ed25519Signer()
    signer.init(true, Ed25519PrivateKeyParameters(seed, 0))
    signer.update(message, 0, message.size)
    return signer.generateSignature()
  }

  fun ed25519Verify(
    signature: ByteArray,
    message: ByteArray,
    publicKey: ByteArray,
  ): Boolean {
    if (signature.size != 64 || publicKey.size != 32) return false
    return try {
      val signer = Ed25519Signer()
      signer.init(false, Ed25519PublicKeyParameters(publicKey, 0))
      signer.update(message, 0, message.size)
      signer.verifySignature(signature)
    } catch (_: RuntimeException) {
      false
    }
  }

  fun x25519PublicKey(secret: ByteArray): ByteArray {
    requireSize(secret, 32, "X25519 secret")
    return X25519PrivateKeyParameters(secret, 0).generatePublicKey().encoded
  }

  fun x25519SharedSecret(secret: ByteArray, publicKey: ByteArray): ByteArray {
    requireSize(secret, 32, "X25519 secret")
    requireSize(publicKey, 32, "X25519 public key")
    val output = ByteArray(32)
    X25519PrivateKeyParameters(secret, 0)
      .generateSecret(X25519PublicKeyParameters(publicKey, 0), output, 0)
    return output
  }

  fun chacha20poly1305Seal(
    key: ByteArray,
    nonce: ByteArray,
    plaintext: ByteArray,
    aad: ByteArray,
  ): ByteArray = chacha(true, key, nonce, plaintext, aad)

  fun chacha20poly1305Open(
    key: ByteArray,
    nonce: ByteArray,
    ciphertext: ByteArray,
    aad: ByteArray,
  ): ByteArray = chacha(false, key, nonce, ciphertext, aad)

  fun xchacha20poly1305Seal(
    key: ByteArray,
    nonce: ByteArray,
    plaintext: ByteArray,
    aad: ByteArray,
  ): ByteArray {
    val (subkey, ietfNonce) = xchachaKeyAndNonce(key, nonce)
    return try {
      chacha(true, subkey, ietfNonce, plaintext, aad)
    } finally {
      subkey.fill(0)
    }
  }

  fun xchacha20poly1305Open(
    key: ByteArray,
    nonce: ByteArray,
    ciphertext: ByteArray,
    aad: ByteArray,
  ): ByteArray {
    val (subkey, ietfNonce) = xchachaKeyAndNonce(key, nonce)
    return try {
      chacha(false, subkey, ietfNonce, ciphertext, aad)
    } finally {
      subkey.fill(0)
    }
  }

  fun mlKem768KeyPair(seed: ByteArray): Map<String, ByteArray> {
    requireSize(seed, 64, "ML-KEM-768 seed")
    val generator = MLKEMKeyPairGenerator()
    generator.init(
      MLKEMKeyGenerationParameters(FixedSecureRandom(seed), MLKEMParameters.ml_kem_768),
    )
    val pair = generator.internalGenerateKeyPair(
      seed.copyOfRange(0, 32),
      seed.copyOfRange(32, 64),
    )
    val publicKey = pair.public as MLKEMPublicKeyParameters
    val secretKey = pair.private as MLKEMPrivateKeyParameters
    return mapOf("publicKey" to publicKey.encoded, "secretKey" to secretKey.encoded)
  }

  fun mlKem768Encapsulate(
    publicKey: ByteArray,
    message: ByteArray,
  ): Map<String, ByteArray> {
    requireSize(publicKey, 1184, "ML-KEM-768 public key")
    requireSize(message, 32, "ML-KEM-768 encapsulation randomness")
    val key = MLKEMPublicKeyParameters(MLKEMParameters.ml_kem_768, publicKey)
    val result = MLKEMGenerator(secureRandom).internalGenerateEncapsulated(key, message)
    return mapOf(
      "cipherText" to result.encapsulation,
      "sharedSecret" to result.secret,
    )
  }

  fun mlKem768Decapsulate(cipherText: ByteArray, secretKey: ByteArray): ByteArray {
    requireSize(cipherText, 1088, "ML-KEM-768 ciphertext")
    requireSize(secretKey, 2400, "ML-KEM-768 secret key")
    val key = MLKEMPrivateKeyParameters(MLKEMParameters.ml_kem_768, secretKey)
    return MLKEMExtractor(key).extractSecret(cipherText)
  }

  fun mlDsa44KeyPair(seed: ByteArray): Map<String, ByteArray> {
    requireSize(seed, 32, "ML-DSA-44 seed")
    val generator = MLDSAKeyPairGenerator()
    generator.init(
      MLDSAKeyGenerationParameters(FixedSecureRandom(seed), MLDSAParameters.ml_dsa_44),
    )
    val pair: AsymmetricCipherKeyPair = generator.generateKeyPair()
    val publicKey = pair.public as MLDSAPublicKeyParameters
    val secretKey = pair.private as MLDSAPrivateKeyParameters
    return mapOf("publicKey" to publicKey.encoded, "secretKey" to secretKey.encoded)
  }

  fun mlDsa44Sign(message: ByteArray, secretKey: ByteArray): ByteArray {
    requireSize(secretKey, 2560, "ML-DSA-44 secret key")
    val signer = DeterministicMLDsaSigner()
    signer.init(true, MLDSAPrivateKeyParameters(MLDSAParameters.ml_dsa_44, secretKey))
    return signer.sign(message)
  }

  fun mlDsa44Verify(
    signature: ByteArray,
    message: ByteArray,
    publicKey: ByteArray,
  ): Boolean {
    if (signature.size != 2420 || publicKey.size != 1312) return false
    return try {
      val signer = MLDSASigner()
      signer.init(false, MLDSAPublicKeyParameters(MLDSAParameters.ml_dsa_44, publicKey))
      signer.update(message, 0, message.size)
      signer.verifySignature(signature)
    } catch (_: RuntimeException) {
      false
    }
  }

  private fun chacha(
    encrypt: Boolean,
    key: ByteArray,
    nonce: ByteArray,
    input: ByteArray,
    aad: ByteArray,
  ): ByteArray {
    requireSize(key, 32, "ChaCha20 key")
    requireSize(nonce, 12, "ChaCha20 nonce")
    val cipher = ChaCha20Poly1305()
    cipher.init(encrypt, AEADParameters(KeyParameter(key), 128, nonce, aad))
    val output = ByteArray(cipher.getOutputSize(input.size))
    var length = cipher.processBytes(input, 0, input.size, output, 0)
    length += cipher.doFinal(output, length)
    return output.copyOf(length)
  }

  /**
   * draft-irtf-cfrg-xchacha: HChaCha20(key, nonce[0..15]) and
   * IETF nonce 0x00000000 || nonce[16..23].
   */
  private fun xchachaKeyAndNonce(
    key: ByteArray,
    nonce: ByteArray,
  ): Pair<ByteArray, ByteArray> {
    requireSize(key, 32, "XChaCha20 key")
    requireSize(nonce, 24, "XChaCha20 nonce")
    val state = IntArray(16)
    state[0] = 0x61707865
    state[1] = 0x3320646e
    state[2] = 0x79622d32
    state[3] = 0x6b206574
    for (index in 0 until 8) state[4 + index] = littleEndianInt(key, index * 4)
    for (index in 0 until 4) state[12 + index] = littleEndianInt(nonce, index * 4)

    repeat(10) {
      quarterRound(state, 0, 4, 8, 12)
      quarterRound(state, 1, 5, 9, 13)
      quarterRound(state, 2, 6, 10, 14)
      quarterRound(state, 3, 7, 11, 15)
      quarterRound(state, 0, 5, 10, 15)
      quarterRound(state, 1, 6, 11, 12)
      quarterRound(state, 2, 7, 8, 13)
      quarterRound(state, 3, 4, 9, 14)
    }

    val subkey = ByteArray(32)
    for ((offset, word) in listOf(0, 1, 2, 3, 12, 13, 14, 15).withIndex()) {
      writeLittleEndian(state[word], subkey, offset * 4)
    }
    val ietfNonce = ByteArray(12)
    nonce.copyInto(ietfNonce, destinationOffset = 4, startIndex = 16, endIndex = 24)
    state.fill(0)
    return subkey to ietfNonce
  }

  private fun quarterRound(state: IntArray, a: Int, b: Int, c: Int, d: Int) {
    state[a] += state[b]
    state[d] = Integer.rotateLeft(state[d] xor state[a], 16)
    state[c] += state[d]
    state[b] = Integer.rotateLeft(state[b] xor state[c], 12)
    state[a] += state[b]
    state[d] = Integer.rotateLeft(state[d] xor state[a], 8)
    state[c] += state[d]
    state[b] = Integer.rotateLeft(state[b] xor state[c], 7)
  }

  private fun littleEndianInt(input: ByteArray, offset: Int): Int =
    (input[offset].toInt() and 0xff) or
      ((input[offset + 1].toInt() and 0xff) shl 8) or
      ((input[offset + 2].toInt() and 0xff) shl 16) or
      ((input[offset + 3].toInt() and 0xff) shl 24)

  private fun writeLittleEndian(value: Int, output: ByteArray, offset: Int) {
    output[offset] = value.toByte()
    output[offset + 1] = (value ushr 8).toByte()
    output[offset + 2] = (value ushr 16).toByte()
    output[offset + 3] = (value ushr 24).toByte()
  }

  private fun digest(digest: org.bouncycastle.crypto.Digest, data: ByteArray): ByteArray {
    digest.update(data, 0, data.size)
    return ByteArray(digest.digestSize).also { digest.doFinal(it, 0) }
  }

  private fun requireOutput(length: Int) {
    require(length in 1..MAX_OUTPUT) { "derived output length is outside the supported range" }
  }

  private fun requireSize(value: ByteArray, expected: Int, label: String) {
    require(value.size == expected) { "$label must be $expected bytes" }
  }

  companion object {
    private const val MAX_OUTPUT = 1024 * 1024
  }
}

/**
 * BC's streaming signer and Noble's FIPS-204 implementation use different internal entry
 * points. Calling the protected byte-oriented primitive with the FIPS pure-mode prefix and
 * an all-zero `rnd` preserves the SDK's deterministic signature wire contract.
 */
private class DeterministicMLDsaSigner : MLDSASigner() {
  fun sign(message: ByteArray): ByteArray =
    internalGenerateSignature(byteArrayOf(0, 0) + message, ByteArray(32))
}
