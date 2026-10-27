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
        // Real Samsung SDK 1.1.0 returns paginated DataResponse<T>. Reading
        // only dataList from the first response silently truncates long logs.
        // No partial results are returned if the page sequence is invalid.
        val entries = mutableListOf<BridgeRecord>()
        val seenTokens = mutableSetOf<String>()
        var token: String? = null
        var pages = 0
        do {
            check(++pages <= 250) { "A Samsung vízadatok lapozása túllépte a korlátot." }
            val request = DataTypes.WATER_INTAKE.readDataRequestBuilder
                .setLocalTimeFilter(LocalTimeFilter.of(from.atStartOfDay(), LocalDateTime.now()))
                .setOrdering(Ordering.ASC)
                .setPageSize(500)
                .apply { if (token != null) setPageToken(token!!) }
                .build()
            val response = store.readData(request)
            response.dataList.forEach { point ->
                val amount = point.getValue(DataType.WaterIntakeType.AMOUNT)?.toDouble()
                    ?: return@forEach
                val id = point.uid?.takeIf { it.isNotBlank() } ?: return@forEach
                if (!amount.isFinite() || amount <= 0.0 || amount > 100000.0) {
                    // Fail closed: never silently copy malformed Health units.
                    throw IllegalArgumentException("Érvénytelen Samsung-vízmennyiség.")
                }
                val source = point.dataSource?.appId
                    ?.takeIf { it.matches(Regex("[a-zA-Z0-9_.-]{1,120}")) }
                    ?: "com.sec.android.app.shealth"
                entries += BridgeRecord(
                    type = "hydration",
                    externalId = "samsunghealth:$source:$id",
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
            check(entries.size <= 100000) { "A Samsung víznapló túl sok rekordot tartalmaz." }
            token = response.pageToken?.takeIf { it.isNotBlank() }
            check(token == null || seenTokens.add(token!!)) {
                "Ismétlődő Samsung lapozási azonosító."
            }
        } while (token != null)
        return entries
    }
}
