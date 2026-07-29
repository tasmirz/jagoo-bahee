package com.jagoobahee.crypto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class JagooCryptoPrimitivesTest {
  private val crypto = JagooCryptoPrimitives()

  @Test
  fun sha256MatchesKnownAnswer() {
    assertArrayEquals(
      hex("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"),
      crypto.sha256("abc".toByteArray()),
    )
  }

  @Test
  fun xchachaRoundTripsAndAuthenticatesAad() {
    val key = ByteArray(32) { it.toByte() }
    val nonce = ByteArray(24) { (it + 32).toByte() }
    val aad = "jagoo".toByteArray()
    val plaintext = "নিরাপদ".toByteArray()
    val sealed = crypto.xchacha20poly1305Seal(key, nonce, plaintext, aad)
    assertArrayEquals(plaintext, crypto.xchacha20poly1305Open(key, nonce, sealed, aad))
    assertFalse(
      runCatching {
        crypto.xchacha20poly1305Open(key, nonce, sealed, "wrong".toByteArray())
      }.isSuccess,
    )
  }

  @Test
  fun ed25519SignsAndRejectsTampering() {
    val seed = ByteArray(32) { 7 }
    val message = "device parity".toByteArray()
    val publicKey = crypto.ed25519PublicKey(seed)
    val signature = crypto.ed25519Sign(message, seed)
    assertTrue(crypto.ed25519Verify(signature, message, publicKey))
    assertFalse(crypto.ed25519Verify(signature, "changed".toByteArray(), publicKey))
  }

  @Test
  fun deterministicOutputsMatchPortableBackendVectors() {
    val message = "Jagoo Bahee · জাগো বাহে · ADR-017".toByteArray(Charsets.UTF_8)
    val key = ByteArray(32) { (it + 1).toByte() }
    val salt = ByteArray(16) { (0xa0 + it).toByte() }
    val aad = "jb:parity:v1".toByteArray()

    assertArrayEquals(
      hex("2a0a090c72a14f8109433c79ec0b72d16389fd60e5ac9ea453274cad1e7f99a6"),
      crypto.sha256(message),
    )
    assertArrayEquals(
      hex("df8c847376aae069bd661b987f5be3cd7dedd00d93a94dcacf0eef76ef9890cfd0081c45df5d8a8279af"),
      crypto.hkdfSha256(key, salt, aad, 42),
    )
    assertArrayEquals(
      hex("67cab098c7d2e4c26b25f1fc227faca07033a97cb39290b293da7e4ed4ad3e82b77af2b4423960e80f7065a4354028db0c0749af87fa5113a52872918f93b8ff"),
      crypto.pbkdf2Sha512(message, salt, 128, 64),
    )
    assertArrayEquals(
      hex("f45e04901cd253024fe271ad09eb3173d53c05e35e8f26f620b2e0ce1b41fe24"),
      crypto.scrypt(message, salt, 16, 1, 1, 32),
    )
    assertArrayEquals(
      hex("8c20357160119849f25abbd9a2435586f60760aa4c883dbb2373fcbfaf3bf075"),
      crypto.argon2id(message, salt, 32, 2, 1, 32),
    )
    assertArrayEquals(
      hex("645259db645c92c9c6b45931c5ced8e1ffd54abd01f6eb2a2cfffc41aae2ef22ad6ace86bc4da5079b05cc3ffcfc3bb966d5ff0b9ad12ee2f155984b4d847d20f5c672"),
      crypto.xchacha20poly1305Seal(key, ByteArray(24) { 9 }, message, aad),
    )

    val kem = crypto.mlKem768KeyPair(ByteArray(64) { 31 })
    val kemPublic = requireNotNull(kem["publicKey"])
    val kemSecret = requireNotNull(kem["secretKey"])
    assertArrayEquals(
      hex("c8cff27632e47d07d6a4a68e384e4662be02f3ad85d5cf730f398bce9b2c7afc"),
      crypto.sha256(kemPublic),
    )
    assertArrayEquals(
      hex("c175af92675bf4784879d146f4476419a70d4fead5efba5c4a6999ec2dd69cd5"),
      crypto.sha256(kemSecret),
    )
    val encapsulated = crypto.mlKem768Encapsulate(kemPublic, ByteArray(32) { 41 })
    assertArrayEquals(
      hex("ae44d94d030c0a5ff600d62053f9e38e38469b68e04f315e2bd68ee690e53cab"),
      crypto.sha256(requireNotNull(encapsulated["cipherText"])),
    )
    assertArrayEquals(
      requireNotNull(encapsulated["sharedSecret"]),
      crypto.mlKem768Decapsulate(requireNotNull(encapsulated["cipherText"]), kemSecret),
    )

    val dsa = crypto.mlDsa44KeyPair(ByteArray(32) { 53 })
    val dsaPublic = requireNotNull(dsa["publicKey"])
    val dsaSecret = requireNotNull(dsa["secretKey"])
    assertArrayEquals(
      hex("ade26686f82a778a993b126563c19ce3659a843a4fa36ed0d0b3d02d7ae5aa20"),
      crypto.sha256(dsaPublic),
    )
    assertArrayEquals(
      hex("97556c864ed2dde0b064ee112411ac85d96893c1128dae6dd6409aec08bc7350"),
      crypto.sha256(dsaSecret),
    )
    val dsaSignature = crypto.mlDsa44Sign(message, dsaSecret)
    assertEquals(
      "185cb556ad974f65721731cb39e7651bb6e039a6beb1c684e927df3a5a1bb7e0",
      crypto.sha256(dsaSignature).toHex(),
    )
    assertTrue(crypto.mlDsa44Verify(dsaSignature, message, dsaPublic))
  }

  private fun hex(value: String): ByteArray =
    value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

  private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
