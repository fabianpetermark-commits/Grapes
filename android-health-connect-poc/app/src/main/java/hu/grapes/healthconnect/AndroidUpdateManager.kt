package hu.grapes.healthconnect

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class AndroidUpdateManager(
    private val context: Context,
    private val candidateBuild: Boolean = BuildConfig.GRAPES_PROD_AUTH_CANDIDATE,
) {
    data class Release(
        val versionCode: Int,
        val versionName: String,
        val notes: String,
        val downloadUrl: String,
        val sha256: String
    )

    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val updateFile = File(context.cacheDir, "updates/grapes-update.apk")

    suspend fun findAvailableRelease(force: Boolean = false): Release? = withContext(Dispatchers.IO) {
        // Private Auth acceptance builds must not offer unrelated stable APKs.
        if (candidateBuild) return@withContext null
        val now = System.currentTimeMillis()
        val lastCheck = preferences.getLong(LAST_CHECK_KEY, 0L)
        if (!force && now - lastCheck < CHECK_INTERVAL_MS) return@withContext null

        val connection = openConnection(RELEASE_API_URL, "application/vnd.github+json")
        try {
            check(connection.responseCode in 200..299) { "A frissítési kiszolgáló nem érhető el (${connection.responseCode})." }
            val release = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            val versionCode = ANDROID_TAG.matchEntire(release.optString("tag_name"))
                ?.groupValues?.getOrNull(1)?.toIntOrNull()
            var availableRelease: Release? = null
            if (versionCode != null && versionCode > BuildConfig.VERSION_CODE) {
                val assets = release.optJSONArray("assets")
                if (assets != null) {
                    for (index in 0 until assets.length()) {
                        val asset = assets.optJSONObject(index) ?: continue
                        if (!asset.optString("name").endsWith(".apk", ignoreCase = true)) continue
                        val digest = asset.optString("digest").removePrefix("sha256:").lowercase()
                        if (!digest.matches(SHA256_PATTERN)) continue
                        availableRelease = Release(
                            versionCode = versionCode,
                            versionName = release.optString("name", "Grapes $versionCode"),
                            notes = release.optString("body"),
                            downloadUrl = asset.getString("browser_download_url"),
                            sha256 = digest
                        )
                        break
                    }
                }
            }
            preferences.edit().putLong(LAST_CHECK_KEY, now).apply()
            availableRelease
        } finally {
            connection.disconnect()
        }
    }

    suspend fun download(release: Release): File = withContext(Dispatchers.IO) {
        check(!candidateBuild) { "Ehhez a próbaverzióhoz ellenőrzött jelöltfrissítés szükséges." }
        updateFile.parentFile?.mkdirs()
        val temporary = File(updateFile.parentFile, "grapes-update.download")
        val digest = MessageDigest.getInstance("SHA-256")
        val connection = openConnection(release.downloadUrl, "application/vnd.android.package-archive")
        try {
            check(connection.responseCode in 200..299) { "A frissítés letöltése sikertelen (${connection.responseCode})." }
            val announcedSize = connection.contentLengthLong
            check(announcedSize < 0 || announcedSize <= MAX_DOWNLOAD_BYTES) { "A frissítés túl nagy." }
            connection.inputStream.use { input ->
                temporary.outputStream().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var downloadedBytes = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        downloadedBytes += count
                        check(downloadedBytes <= MAX_DOWNLOAD_BYTES) { "A frissítés túl nagy." }
                        digest.update(buffer, 0, count)
                        output.write(buffer, 0, count)
                    }
                }
            }
            val actual = digest.digest().joinToString("") { "%02x".format(it) }
            check(actual == release.sha256) { "A letöltött frissítés ellenőrzőösszege hibás." }
            if (updateFile.exists()) check(updateFile.delete()) { "A korábbi frissítés nem távolítható el." }
            check(temporary.renameTo(updateFile)) { "A frissítés nem készíthető elő." }
            updateFile
        } finally {
            connection.disconnect()
            if (temporary.exists()) temporary.delete()
        }
    }

    fun requestInstall(apk: File) {
        check(!candidateBuild) { "Ehhez a próbaverzióhoz ellenőrzött jelöltfrissítés szükséges." }
        check(apk.isFile) { "A frissítési fájl nem található." }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            preferences.edit().putBoolean(PENDING_INSTALL_KEY, true).apply()
            context.startActivity(Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}")
            ))
            return
        }
        preferences.edit().remove(PENDING_INSTALL_KEY).apply()
        val uri = FileProvider.getUriForFile(context, "${BuildConfig.APPLICATION_ID}.fileprovider", apk)
        context.startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    fun resumePendingInstall(): Boolean {
        if (candidateBuild) return false
        if (!preferences.getBoolean(PENDING_INSTALL_KEY, false) || !updateFile.isFile) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) return false
        requestInstall(updateFile)
        return true
    }

    private fun openConnection(url: String, accept: String) = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 15_000
        readTimeout = 60_000
        instanceFollowRedirects = true
        setRequestProperty("Accept", accept)
        setRequestProperty("User-Agent", "Grapes-Android/${BuildConfig.VERSION_NAME}")
    }

    companion object {
        private const val RELEASE_API_URL = "https://api.github.com/repos/fabianpetermark-commits/Grapes/releases/latest"
        private const val PREFERENCES = "grapes-android-updates"
        private const val LAST_CHECK_KEY = "last-check"
        private const val PENDING_INSTALL_KEY = "pending-install"
        private const val CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000L
        private const val MAX_DOWNLOAD_BYTES = 250L * 1024 * 1024
        private val ANDROID_TAG = Regex("android-v(\\d+)")
        private val SHA256_PATTERN = Regex("[0-9a-f]{64}")
    }
}
