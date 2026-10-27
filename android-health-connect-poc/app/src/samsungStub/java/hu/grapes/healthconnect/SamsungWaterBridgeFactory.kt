package hu.grapes.healthconnect

import android.app.Activity
import android.content.Context
import java.time.LocalDate

object SamsungWaterBridgeFactory {
    fun create(context: Context): SamsungWaterBridge = object : SamsungWaterBridge {
        override val available = false
        override val availabilityMessage =
            "A Samsung Health Data SDK AAR nincs telepítve. Lásd: app/libs/README.md"

        override suspend fun hasReadPermission() = false
        override suspend fun requestReadPermission(activity: Activity) = false
        override suspend fun readWater(from: LocalDate): List<BridgeRecord> = emptyList()
    }
}
