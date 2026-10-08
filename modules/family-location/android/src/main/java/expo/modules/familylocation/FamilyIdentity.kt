package expo.modules.familylocation

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature

object FamilyIdentity {
  private const val ALIAS = "family_location_identity_v1"
  private const val PREFS = "family_identity_v1"
  private const val MEMBERSHIP = "membership"

  private fun keyPair(): java.security.KeyPair {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val existing = store.getEntry(ALIAS, null) as? KeyStore.PrivateKeyEntry
    if (existing != null) return java.security.KeyPair(existing.certificate.publicKey, existing.privateKey)
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
    generator.initialize(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
        .setAlgorithmParameterSpec(java.security.spec.ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .build()
    )
    return generator.generateKeyPair()
  }

  fun identity(): Map<String, Any> {
    val publicKey = keyPair().public.encoded
    val hash = MessageDigest.getInstance("SHA-256").digest(publicKey)
    val deviceId = "dev_" + hash.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    return mapOf(
      "deviceId" to deviceId,
      "publicKey" to Base64.encodeToString(publicKey, Base64.NO_WRAP),
      "displayName" to "This phone"
    )
  }

  fun sign(message: String): String {
    val signature = Signature.getInstance("SHA256withECDSA")
    signature.initSign(keyPair().private)
    signature.update(message.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(signature.sign(), Base64.NO_WRAP)
  }

  fun getMembership(context: Context): String? =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(MEMBERSHIP, null)

  fun saveMembership(context: Context, json: String) {
    val data = JSONObject(json)
    require(data.has("familyId") && data.has("role"))
    check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(MEMBERSHIP, json).commit())
  }

  fun clearMembership(context: Context) {
    check(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(MEMBERSHIP).commit())
  }
}
