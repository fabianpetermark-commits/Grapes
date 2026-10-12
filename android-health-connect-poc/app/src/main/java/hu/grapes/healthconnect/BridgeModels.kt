package hu.grapes.healthconnect

import org.json.JSONArray
import org.json.JSONObject

data class BridgeRecord(
    val type: String,
    val externalId: String,
    val sourcePackage: String,
    val clientRecordId: String?,
    val startTime: String,
    val endTime: String,
    val name: String?,
    val mealType: String?,
    val energyKcal: Double?,
    val proteinGrams: Double?,
    val carbohydrateGrams: Double?,
    val fatGrams: Double?,
    val volumeMilliliters: Double?
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("type", type); put("externalId", externalId); put("sourcePackage", sourcePackage)
        put("clientRecordId", clientRecordId ?: JSONObject.NULL)
        put("startTime", startTime); put("endTime", endTime)
        put("name", name ?: JSONObject.NULL); put("mealType", mealType ?: JSONObject.NULL)
        put("energyKcal", energyKcal ?: JSONObject.NULL)
        put("proteinGrams", proteinGrams ?: JSONObject.NULL)
        put("carbohydrateGrams", carbohydrateGrams ?: JSONObject.NULL)
        put("fatGrams", fatGrams ?: JSONObject.NULL)
        put("volumeMilliliters", volumeMilliliters ?: JSONObject.NULL)
    }
}

data class BridgeExport(val generatedAt: String, val records: List<BridgeRecord>) {
    fun toJson(): String = JSONObject().apply {
        put("schemaVersion", 1)
        put("producer", "hu.grapes.healthconnect")
        put("generatedAt", generatedAt)
        put("records", JSONArray().apply { records.forEach { put(it.toJson()) } })
    }.toString(2)
}
