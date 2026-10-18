package hu.grapes.healthconnect

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

/** Device-local encrypted YAZIO credentials. Never backed up to Drive. */
class YazioCredentialVault(private val context: Context) {
    private val preferences = context.getSharedPreferences("grapes_yazio_private", Context.MODE_PRIVATE)
    private val alias = "grapes_yazio_credentials_v1"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build())
        return generator.generateKey()
    }

    fun save(email: String, password: String) {
        require(email.contains("@") && password.isNotEmpty())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val bytes = JSONObject().put("email", email).put("password", password).toString().toByteArray(Charsets.UTF_8)
        val payload = Base64.encodeToString(cipher.iv + cipher.doFinal(bytes), Base64.NO_WRAP)
        check(preferences.edit().putString("credentials", payload).commit()) { "Nem sikerült a titkosított mentés." }
    }

    fun read(): Pair<String, String>? {
        val encoded = preferences.getString("credentials", null) ?: return null
        return try {
            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
            require(bytes.size > 12)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            val data = JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
            data.getString("email") to data.getString("password")
        } catch (_: Exception) {
            clear()
            null
        }
    }

    fun hasCredentials() = preferences.contains("credentials")
    fun clear() { preferences.edit().remove("credentials").commit() }
}
