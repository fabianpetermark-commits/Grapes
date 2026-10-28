package hu.grapes.healthconnect

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.util.Base64

class QrPngPayloadTest {
    @Test fun pngPayloadRetainsBytesAndRejectsOtherTypesAndOversizedInputs() {
        val png = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3)
        val input = "data:image/png;base64," + Base64.getEncoder().encodeToString(png)
        assertArrayEquals(png, QrPngPayload.decode(input))
        assertThrows(IllegalArgumentException::class.java) { QrPngPayload.decode("data:text/plain;base64,aGVsbG8=") }
        assertThrows(IllegalArgumentException::class.java) { QrPngPayload.decode("data:image/png;base64,aGVsbG8=") }
        assertThrows(IllegalArgumentException::class.java) { QrPngPayload.decode("data:image/png;base64," + "A".repeat(2_800_001)) }
    }
}
