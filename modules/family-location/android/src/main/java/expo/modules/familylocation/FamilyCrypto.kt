package expo.modules.familylocation

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object FamilyCrypto {
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

  fun hasKey(context: Context, familyId: String): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).contains(familyId)

  fun createKey(context: Context, familyId: String) {
    require(familyId.isNotBlank())
    if (hasKey(context, familyId)) return
    val raw = ByteArray(32).also { SecureRandom().nextBytes(it) }
    try { storeKey(context, familyId, raw) } finally { raw.fill(0) }
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
    check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(familyId).commit())
  }
}
