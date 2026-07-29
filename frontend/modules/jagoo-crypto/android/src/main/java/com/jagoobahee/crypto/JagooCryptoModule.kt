package com.jagoobahee.crypto

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class JagooCryptoModule : Module() {
  private val crypto = JagooCryptoPrimitives()

  override fun definition() = ModuleDefinition {
    Name("JagooCrypto")

    Constants("backendId" to "android-bc-1.79")

    Function("randomBytes", crypto::randomBytes)
    Function("sha256", crypto::sha256)
    Function("sha512", crypto::sha512)
    Function("hmacSha512", crypto::hmacSha512)
    Function("hkdfSha256", crypto::hkdfSha256)
    Function("pbkdf2Sha512", crypto::pbkdf2Sha512)
    Function("scrypt", crypto::scrypt)
    Function("argon2id", crypto::argon2id)

    Function("ed25519PublicKey", crypto::ed25519PublicKey)
    Function("ed25519Sign", crypto::ed25519Sign)
    Function("ed25519Verify", crypto::ed25519Verify)
    Function("x25519PublicKey", crypto::x25519PublicKey)
    Function("x25519SharedSecret", crypto::x25519SharedSecret)

    Function("chacha20poly1305Seal", crypto::chacha20poly1305Seal)
    Function("chacha20poly1305Open", crypto::chacha20poly1305Open)
    Function("xchacha20poly1305Seal", crypto::xchacha20poly1305Seal)
    Function("xchacha20poly1305Open", crypto::xchacha20poly1305Open)

    Function("mlKem768KeyPair", crypto::mlKem768KeyPair)
    Function("mlKem768Encapsulate", crypto::mlKem768Encapsulate)
    Function("mlKem768Decapsulate", crypto::mlKem768Decapsulate)
    Function("mlDsa44KeyPair", crypto::mlDsa44KeyPair)
    Function("mlDsa44Sign", crypto::mlDsa44Sign)
    Function("mlDsa44Verify", crypto::mlDsa44Verify)
  }
}
