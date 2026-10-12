package hu.grapes.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.feature.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class HealthConnectBridge(private val context: Context) {
    companion object {
        const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"
        const val TEST_CLIENT_RECORD_ID = "grapes-poc-nutrition-v1"
        val basePermissions = setOf(
            HealthPermission.getReadPermission(NutritionRecord::class),
            HealthPermission.getWritePermission(NutritionRecord::class),
            HealthPermission.getReadPermission(HydrationRecord::class)
        )
        val permissionContract = PermissionController.createRequestPermissionResultContract()
    }

    fun sdkStatus(): Int = HealthConnectClient.getSdkStatus(context, PROVIDER_PACKAGE)
    private fun client() = HealthConnectClient.getOrCreate(context, PROVIDER_PACKAGE)

    suspend fun requestedPermissions(): Set<String> = basePermissions.toMutableSet().apply {
        if (client().features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY)
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

    suspend fun writeTestNutrition(): String {
        val now = Instant.now()
        val record = NutritionRecord(
            startTime = now.minusSeconds(60), startZoneOffset = null,
            endTime = now, endZoneOffset = null,
            name = "Grapes Health Connect próba",
            mealType = NutritionRecord.MEAL_TYPE_SNACK,
            energy = Energy.kilocalories(250.0), protein = Mass.grams(12.0),
            totalCarbohydrate = Mass.grams(30.0), totalFat = Mass.grams(9.0),
            metadata = Metadata.manualEntry(
                clientRecordId = TEST_CLIENT_RECORD_ID,
                clientRecordVersion = 1
            )
        )
        return client().insertRecords(listOf(record)).recordIdsList.single()
    }

    suspend fun deleteTestNutrition() = client().deleteRecords(
        NutritionRecord::class, recordIdsList = emptyList(),
        clientRecordIdsList = listOf(TEST_CLIENT_RECORD_ID)
    )

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
        NutritionRecord.MEAL_TYPE_BREAKFAST -> "breakfast"
        NutritionRecord.MEAL_TYPE_LUNCH -> "lunch"
        NutritionRecord.MEAL_TYPE_DINNER -> "dinner"
        NutritionRecord.MEAL_TYPE_SNACK -> "snack"
        else -> null
    }
}
