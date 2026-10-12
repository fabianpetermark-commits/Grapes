package hu.grapes.healthconnect

import android.app.Activity
import java.time.LocalDate

interface SamsungWaterBridge {
    val available: Boolean
    val availabilityMessage: String
    suspend fun requestReadPermission(activity: Activity): Boolean
    suspend fun readWater(from: LocalDate): List<BridgeRecord>
}
