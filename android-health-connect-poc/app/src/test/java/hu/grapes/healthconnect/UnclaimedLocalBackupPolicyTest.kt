package hu.grapes.healthconnect

import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.*
import org.junit.Test

class UnclaimedLocalBackupPolicyTest {
    private val filename = "grapes-helyi-adatok-2026-10-25.json"
    private val user = "00000000-0000-4000-8000-000000000001"

    @Test fun onlyVerifiedNativeQaCanCreateUnclaimedBackup() {
        assertTrue(UnclaimedLocalBackupPolicy.allow(true, true, true, user, filename))
        assertFalse(UnclaimedLocalBackupPolicy.allow(false, true, true, user, filename))
        assertFalse(UnclaimedLocalBackupPolicy.allow(true, false, true, user, filename))
        assertFalse(UnclaimedLocalBackupPolicy.allow(true, true, false, user, filename))
        assertFalse(UnclaimedLocalBackupPolicy.allow(true, true, true, null, filename))
        assertFalse(UnclaimedLocalBackupPolicy.allow(true, true, true, "", filename))
        assertFalse(UnclaimedLocalBackupPolicy.allow(true, true, true, "not-a-uuid", filename))
    }

    @Test fun untrustedNamesCanNeverEscalateToSpecialBackupHandler() {
        for (name in listOf(
            "../grapes-helyi-adatok-2026-10-25.json",
            "grapes-helyi-adatok-2026-10-25.json/../escape",
            "grapes-helyi-adatok-2026-10-25.json.exe",
            "grapes-helyi-adatok-2026-10-25.json\n",
            "grapes-helyi-adatok-2026-10-25.JSON",
            "grapes-health-attekintes-2026-10-25.json",
            "grapes-etelnaplo-2026-10-25.json",
            "grapes-helyi-adatok-yesterday.json",
        )) {
            assertFalse(UnclaimedLocalBackupPolicy.allow(true, true, true, user, name))
            assertFalse(UnclaimedLocalBackupPolicy.requiresIndependentReadback(name))
        }
        assertTrue(UnclaimedLocalBackupPolicy.requiresIndependentReadback(filename))
    }

    @Test fun nativeReopenReceiptsAreByteExactEvenForUtf8OrTruncatedWrites() {
        val utf8 = """{"grapesLocalMigrationBackup":true,"ownership":"unclaimed","note":"Őrzött ☘"}"""
            .toByteArray(Charsets.UTF_8)
        val ok = verifyBackupReadback(ByteArrayInputStream(utf8), ByteArrayInputStream(utf8))
        assertEquals(utf8.size.toLong(), ok.bytes)
        assertEquals(64, ok.sha256.length)
        for (bad in listOf(
            utf8.copyOf(utf8.size - 1),
            utf8.copyOf().also { it[it.lastIndex] = '!'.code.toByte() },
        )) {
            try {
                verifyBackupReadback(ByteArrayInputStream(utf8), ByteArrayInputStream(bad))
                fail("Altered Android SAF file was wrongly accepted")
            } catch (_: IllegalStateException) { }
        }
    }

    @Test fun providerReadFailureIsNeverAReceipt() {
        val source = "{}".toByteArray(Charsets.UTF_8)
        val failed = object : InputStream() {
            override fun read(): Int = throw IOException("synthetic provider closed")
            override fun read(b: ByteArray, off: Int, len: Int): Int =
                throw IOException("synthetic provider closed")
        }
        try {
            verifyBackupReadback(ByteArrayInputStream(source), failed)
            fail("Broken provider incorrectly returned a verified receipt")
        } catch (_: IOException) { }
    }
}
