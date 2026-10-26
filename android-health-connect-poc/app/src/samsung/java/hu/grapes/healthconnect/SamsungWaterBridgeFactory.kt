package hu.grapes.healthconnect

import android.app.Activity
import android.content.Context
import com.samsung.android.sdk.health.data.HealthDataService
import com.samsung.android.sdk.health.data.error.HealthDataException
import com.samsung.android.sdk.health.data.error.ResolvablePlatformException
import com.samsung.android.sdk.health.data.permission.AccessType
import com.samsung.android.sdk.health.data.permission.Permission
import com.samsung.android.sdk.health.data.request.DataType
import com.samsung.android.sdk.health.data.request.DataTypes
import com.samsung.android.sdk.health.data.request.LocalTimeFilter
import com.samsung.android.sdk.health.data.request.Ordering
import java.time.LocalDate
import java.time.LocalDateTime

object SamsungWaterBridgeFactory {
    fun create(context: Context): SamsungWaterBridge = SamsungSdkWaterBridge(context)
}

private class SamsungSdkWaterBridge(context: Context) : SamsungWaterBridge {
    private val store = HealthDataService.getStore(context.applicationContext)
    private val readPermission = Permission.of(DataTypes.WATER_INTAKE, AccessType.READ)

    override val available = true
    override val availabilityMessage =
        "Samsung Health Data SDK elérhető. Samsung Health 6.30.2+ és fejlesztői/partner hozzáférés szükséges."

    override suspend fun hasReadPermission(): Boolean =
        runCatching { store.getGrantedPermissions(setOf(readPermission)).contains(readPermission) }
            .getOrDefault(false)

    override suspend fun requestReadPermission(activity: Activity): Boolean {
        val requested = setOf(readPermission)
        return try {
            val granted = store.getGrantedPermissions(requested)
            if (granted.containsAll(requested)) true
            else store.requestPermissions(requested, activity).containsAll(requested)
        } catch (error: HealthDataException) {
            if (error is ResolvablePlatformException && error.hasResolution) {
                error.resolve(activity)
            }
            false
        }
    }

    override suspend fun readWater(from: LocalDate): List<BridgeRecord> {
        val request = DataTypes.WATER_INTAKE.readDataRequestBuilder
            .setLocalTimeFilter(LocalTimeFilter.of(from.atStartOfDay(), LocalDateTime.now()))
            .setOrdering(Ordering.ASC)
            .build()

        return store.readData(request).dataList.mapNotNull { point ->
            val amount = point.getValue(DataType.WaterIntakeType.AMOUNT)?.toDouble()
                ?: return@mapNotNull null
            val source = point.dataSource?.appId ?: "com.sec.android.app.shealth"
            BridgeRecord(
                type = "hydration",
                externalId = "samsunghealth:$source:${point.uid}",
                sourcePackage = source,
                clientRecordId = point.clientDataId,
                startTime = point.startTime.toString(),
                endTime = (point.endTime ?: point.startTime).toString(),
                name = "Víz",
                mealType = null,
                energyKcal = null,
                proteinGrams = null,
                carbohydrateGrams = null,
                fatGrams = null,
                volumeMilliliters = amount
            )
        }
    }
}
