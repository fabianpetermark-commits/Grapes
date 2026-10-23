package hu.grapes.healthconnect

import android.app.Application
import android.content.Context
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class AuthCandidateUpdateTest {
    private val app: Application get() = RuntimeEnvironment.getApplication()

    @Test
    fun candidateDoesNotCheckStableOrResumeItsPendingInstaller() = runBlocking {
        val prefs = app.getSharedPreferences("grapes-android-updates", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("pending-install", true).putLong("last-check", 123L).commit()
        val cached = File(app.cacheDir, "updates/grapes-update.apk")
        cached.parentFile?.mkdirs()
        cached.writeText("existing cached stable APK")
        val manager = AndroidUpdateManager(app, candidateBuild = true)

        assertNull(manager.findAvailableRelease(force = true))
        assertFalse(manager.resumePendingInstall())
        assertNull(shadowOf(app).nextStartedActivity)
        assertTrue(prefs.getBoolean("pending-install", false))
        assertEquals(123L, prefs.getLong("last-check", 0L))
        assertEquals("existing cached stable APK", cached.readText())
    }

    @Test
    fun candidateRejectsStaleDownloadAndInstallRequestsBeforeChangingFiles() = runBlocking {
        val manager = AndroidUpdateManager(app, candidateBuild = true)
        val cached = File(app.cacheDir, "updates/grapes-update.apk")
        cached.parentFile?.mkdirs()
        cached.writeText("existing cache")
        val stable = AndroidUpdateManager.Release(99, "stable", "", "https://invalid.invalid/never-fetch.apk", "0".repeat(64))
        var downloadDenied = false
        try { manager.download(stable) } catch (_: IllegalStateException) { downloadDenied = true }
        assertTrue(downloadDenied)
        var installDenied = false
        try { manager.requestInstall(cached) } catch (_: IllegalStateException) { installDenied = true }
        assertTrue(installDenied)
        assertEquals("existing cache", cached.readText())
        assertNull(shadowOf(app).nextStartedActivity)
    }
}
