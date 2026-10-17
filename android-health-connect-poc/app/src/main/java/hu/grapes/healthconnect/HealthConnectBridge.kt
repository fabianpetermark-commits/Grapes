package hu.grapes.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class HealthConnectBridge(private val context: Context) {
    companion object {
        const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"
        val readPermissions = setOf(
            HealthPermission.getReadPermission(NutritionRecord::class),
            HealthPermission.getReadPermission(HydrationRecord::class)
        )
        val permissionContract = PermissionController.createRequestPermissionResultContract()
    }

    fun sdkStatus(): Int = HealthConnectClient.getSdkStatus(context, PROVIDER_PACKAGE)
    private fun client() = HealthConnectClient.getOrCreate(context, PROVIDER_PACKAGE)

    suspend fun requestedPermissions(from: LocalDate): Set<String> = readPermissions.toMutableSet().apply {
        if (from.isBefore(LocalDate.now().minusDays(29)) &&
            client().features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY)
                == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE) {
            add(HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY)
        }
    }

    suspend fun grantedPermissions() = client().permissionController.getGrantedPermissions()

    suspend fun readExport(from: LocalDate): BridgeExport {
        val start = from.atStartOfDay(ZoneId.systemDefault()).toInstant()
        val records = (readNutrition(start) + readHydration(start))
            .filterNot { it.sourcePackage == context.packageName }
            .sortedByDescending { it.startTime }
        return BridgeExport(Instant.now().toString(), records)
    }

    private suspend fun readNutrition(start: Instant): List<BridgeRecord> {
        val result = mutableListOf<BridgeRecord>(); var token: String? = null
        do {
            val page = client().readRecords(ReadRecordsRequest(
                recordType = NutritionRecord::class,
                timeRangeFilter = TimeRangeFilter.between(start, Instant.now()),
                pageSize = 500,
                pageToken = token
            ))
            result += page.records.map { r -> BridgeRecord(
                "nutrition", externalId(r.metadata.dataOrigin.packageName, r.metadata.id),
                r.metadata.dataOrigin.packageName, r.metadata.clientRecordId,
                r.startTime.toString(), r.endTime.toString(), r.name, mealType(r.mealType),
                r.energy?.inKilocalories, r.protein?.inGrams,
                r.totalCarbohydrate?.inGrams, r.totalFat?.inGrams, null
            ) }
            token = page.pageToken
        } while (token != null)
        return result
    }

    private suspend fun readHydration(start: Instant): List<BridgeRecord> {
        val result = mutableListOf<BridgeRecord>(); var token: String? = null
        do {
            val page = client().readRecords(ReadRecordsRequest(
                recordType = HydrationRecord::class,
                timeRangeFilter = TimeRangeFilter.between(start, Instant.now()),
                pageSize = 500,
                pageToken = token
            ))
            result += page.records.map { r -> BridgeRecord(
                "hydration", externalId(r.metadata.dataOrigin.packageName, r.metadata.id),
                r.metadata.dataOrigin.packageName, r.metadata.clientRecordId,
                r.startTime.toString(), r.endTime.toString(), "Víz", null,
                null, null, null, null, r.volume.inLiters * 1000.0
            ) }
            token = page.pageToken
        } while (token != null)
        return result
    }

    private fun externalId(origin: String, id: String) = "healthconnect:$origin:$id"
    private fun mealType(value: Int): String? = when (value) {
        MealType.MEAL_TYPE_BREAKFAST -> "breakfast"
        MealType.MEAL_TYPE_LUNCH -> "lunch"
        MealType.MEAL_TYPE_DINNER -> "dinner"
        MealType.MEAL_TYPE_SNACK -> "snack"
        else -> null
    }
}

