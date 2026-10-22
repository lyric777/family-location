package expo.modules.familylocation

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import java.security.KeyPairGenerator
import java.security.KeyFactory
import java.security.spec.X509EncodedKeySpec
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

object FamilyCrypto {
  private const val EXCHANGE_ALIAS = "family_location_exchange_v1"
  private const val WRAP_ALIAS = "family_location_wrap_v1"
  private const val PREFS = "family_crypto_v1"
  private const val TAG_BITS = 128
  private fun b64(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)
  private fun from64(text: String) = Base64.decode(text, Base64.DEFAULT)

  private fun wrappingKey(): java.security.Key {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    store.getKey(WRAP_ALIAS, null)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(WRAP_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return generator.generateKey()
  }

  private fun exchangePair(): java.security.KeyPair {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val existing = store.getEntry(EXCHANGE_ALIAS, null) as? KeyStore.PrivateKeyEntry
    if (existing != null) return java.security.KeyPair(existing.certificate.publicKey, existing.privateKey)
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
    generator.initialize(
      KeyGenParameterSpec.Builder(EXCHANGE_ALIAS, KeyProperties.PURPOSE_AGREE_KEY)
        .setAlgorithmParameterSpec(java.security.spec.ECGenParameterSpec("secp256r1"))
        .build()
    )
    return generator.generateKeyPair()
  }

  fun exchangePublicKey(): String = b64(exchangePair().public.encoded)

  private fun exchangeKey(peerPublicKey: String, familyId: String): ByteArray {
    val peer = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(from64(peerPublicKey)))
    val agreement = KeyAgreement.getInstance("ECDH")
    agreement.init(exchangePair().private)
    agreement.doPhase(peer, true)
    val secret = agreement.generateSecret()
    try {
      val mac = Mac.getInstance("HmacSHA256")
      mac.init(SecretKeySpec(familyId.toByteArray(Charsets.UTF_8), "HmacSHA256"))
      val prk = mac.doFinal(secret)
      mac.init(SecretKeySpec(prk, "HmacSHA256"))
      return mac.doFinal("family-key-wrap-v1".toByteArray(Charsets.UTF_8) + byteArrayOf(1)).copyOf(32)
    } finally { secret.fill(0) }
  }

  private fun keyPackageContext(familyId: String, senderId: String, recipientId: String, epoch: Int): ByteArray =
    org.json.JSONArray().put("family-key-v1").put(familyId).put(senderId).put(recipientId).put(epoch)
      .toString().toByteArray(Charsets.UTF_8)

  fun exportKeyForMember(context: Context, familyId: String, peerPublicKey: String, senderId: String, recipientId: String, epoch: Int): Map<String, String> {
    val raw = loadKey(context, familyId)
    val wrapping = exchangeKey(peerPublicKey, familyId)
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(wrapping, "AES"))
      cipher.updateAAD(keyPackageContext(familyId, senderId, recipientId, epoch))
      return mapOf("nonce" to b64(cipher.iv), "ciphertext" to b64(cipher.doFinal(raw)))
    } finally { raw.fill(0); wrapping.fill(0) }
  }

  fun importKeyFromMember(context: Context, familyId: String, senderPublicKey: String, nonce: String, ciphertext: String, senderId: String, recipientId: String, epoch: Int) {
    val wrapping = exchangeKey(senderPublicKey, familyId)
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(wrapping, "AES"), GCMParameterSpec(TAG_BITS, from64(nonce)))
      cipher.updateAAD(keyPackageContext(familyId, senderId, recipientId, epoch))
      val raw = cipher.doFinal(from64(ciphertext))
      try { storeKey(context, familyId, raw); setEpoch(context, familyId, epoch) } finally { raw.fill(0) }
    } finally { wrapping.fill(0) }
  }

  fun keyEpoch(context: Context, familyId: String): Int {
    val stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("epoch:" + familyId, 0)
    return if (hasKey(context, familyId)) stored else 0
  }

  private fun setEpoch(context: Context, familyId: String, epoch: Int) {
    require(epoch > 0)
    check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putInt("epoch:" + familyId, epoch).commit())
  }

  fun hasKey(context: Context, familyId: String): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).contains(familyId)

  fun createKey(context: Context, familyId: String, epoch: Int) {
    require(familyId.isNotBlank())
    if (hasKey(context, familyId)) {
      require(keyEpoch(context, familyId) == epoch) { "Family key epoch mismatch" }
      return
    }
    val raw = ByteArray(32).also { SecureRandom().nextBytes(it) }
    try { storeKey(context, familyId, raw); setEpoch(context, familyId, epoch) } finally { raw.fill(0) }
  }

  fun rotateKey(context: Context, familyId: String, epoch: Int) {
    require(epoch > keyEpoch(context, familyId)) { "Rotation epoch must advance" }
    require(hasKey(context, familyId)) { "Cannot rotate missing family key" }
    val raw = ByteArray(32).also { SecureRandom().nextBytes(it) }
    try { storeKey(context, familyId, raw); setEpoch(context, familyId, epoch) } finally { raw.fill(0) }
  }

  private fun storeKey(context: Context, familyId: String, raw: ByteArray) {
    require(raw.size == 32)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, wrappingKey())
    cipher.updateAAD(familyId.toByteArray(Charsets.UTF_8))
    val value = JSONObject().put("iv", b64(cipher.iv)).put("data", b64(cipher.doFinal(raw))).toString()
    check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(familyId, value).commit())
  }

  private fun loadKey(context: Context, familyId: String): ByteArray {
    val value = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(familyId, null)
      ?: error("Family key not provisioned")
    val json = JSONObject(value)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, wrappingKey(), GCMParameterSpec(TAG_BITS, from64(json.getString("iv"))))
    cipher.updateAAD(familyId.toByteArray(Charsets.UTF_8))
    return cipher.doFinal(from64(json.getString("data")))
  }

  fun encrypt(context: Context, familyId: String, plaintext: String, aad: String): Map<String, String> {
    val raw = loadKey(context, familyId)
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(raw, "AES"))
      cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
      return mapOf("nonce" to b64(cipher.iv), "ciphertext" to b64(cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))))
    } finally { raw.fill(0) }
  }

  fun decrypt(context: Context, familyId: String, nonce: String, ciphertext: String, aad: String): String {
    val raw = loadKey(context, familyId)
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(raw, "AES"), GCMParameterSpec(TAG_BITS, from64(nonce)))
      cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
      return String(cipher.doFinal(from64(ciphertext)), Charsets.UTF_8)
    } finally { raw.fill(0) }
  }

  fun deleteKey(context: Context, familyId: String) {
    check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(familyId).remove("epoch:" + familyId).commit())
  }
}
