package hu.grapes.healthconnect

import java.io.InputStream
import java.security.MessageDigest

internal data class VerifiedBackupReceipt(val bytes: Long, val sha256: String)

private fun digestBackup(stream: InputStream): VerifiedBackupReceipt {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(16 * 1024)
    var bytes = 0L
    while (true) {
        val size = stream.read(buffer)
        if (size < 0) break
        if (size == 0) continue
        digest.update(buffer, 0, size)
        bytes += size
    }
    return VerifiedBackupReceipt(bytes, digest.digest().joinToString("") {
        "%02x".format(it.toInt() and 0xff)
    })
}

/** Reopen the selected SAF document and compare it with the staged bytes. */
internal fun verifyBackupReadback(
    staged: InputStream,
    saved: InputStream
): VerifiedBackupReceipt {
    val expected = digestBackup(staged)
    val actual = digestBackup(saved)
    check(expected.bytes > 0 && expected == actual) {
        "A mentett Health-fájl visszaolvasása eltér az eredetitől."
    }
    return actual
}
