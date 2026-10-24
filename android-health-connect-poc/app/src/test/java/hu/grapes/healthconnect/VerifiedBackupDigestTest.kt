package hu.grapes.healthconnect

import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.*
import org.junit.Test

class VerifiedBackupDigestTest {
    private val source = """{"grapesHealthMigrationBackup":true,"synthetic":"adat"}"""
        .toByteArray(Charsets.UTF_8)

    @Test fun exactReadbackProducesReceipt() {
        val receipt = verifyBackupReadback(
            ByteArrayInputStream(source), ByteArrayInputStream(source))
        assertEquals(source.size.toLong(), receipt.bytes)
        assertEquals(64, receipt.sha256.length)
    }

    @Test fun shortenedOrChangedDocumentIsNeverVerified() {
        for (changed in listOf(source.copyOf(source.size - 1),
            source.clone().also { it[it.lastIndex] = '!'.code.toByte() })) {
            try {
                verifyBackupReadback(ByteArrayInputStream(source), ByteArrayInputStream(changed))
                fail("Changed SAF document was accepted")
            } catch (_: IllegalStateException) { }
        }
    }

    @Test fun interruptedReadCannotProduceSuccess() {
        val broken = object : InputStream() {
            override fun read(): Int = throw IOException("synthetic provider failure")
            override fun read(b: ByteArray, off: Int, len: Int): Int =
                throw IOException("synthetic provider failure")
        }
        try {
            verifyBackupReadback(ByteArrayInputStream(source), broken)
            fail("Interrupted read was accepted")
        } catch (_: IOException) { }
    }
}
