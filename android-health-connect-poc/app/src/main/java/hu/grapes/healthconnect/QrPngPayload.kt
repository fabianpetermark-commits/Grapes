package hu.grapes.healthconnect

import java.util.Base64

internal object QrPngPayload {
    private const val PREFIX = "data:image/png;base64,"
    private val signature = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

    fun decode(dataUrl: String): ByteArray {
        require(dataUrl.startsWith(PREFIX) && dataUrl.length <= 2_800_000) { "Érvénytelen vagy túl nagy QR PNG." }
        val bytes = Base64.getDecoder().decode(dataUrl.substring(PREFIX.length))
        require(bytes.size in 8..2_000_000 && bytes.copyOfRange(0, 8).contentEquals(signature)) { "Érvénytelen PNG-adat." }
        return bytes
    }
}
