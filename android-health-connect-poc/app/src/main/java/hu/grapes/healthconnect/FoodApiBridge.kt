package hu.grapes.healthconnect

import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** URL-allowlisted API transport to avoid Android WebView cross-origin failures. */
internal class FoodApiBridge {
    suspend fun execute(args: JSONArray): JSONObject = withContext(Dispatchers.IO) {
        val kind = args.optString(0)
        val query = args.optString(1).trim().replace(Regex("\\s+"), " ")
        require(query.length in 2..120) { "A keresőkifejezés 2–120 karakter lehet." }
        val page = args.optInt(2, 1).coerceIn(1, 5)
        val pageSize = args.optInt(3, 12).coerceIn(1, 24)
        val region = args.optString(4, "hu").takeIf { it in countries || it == "all" } ?: "hu"
        when (kind) {
            "offSearch" -> request("https://search.openfoodfacts.org/search?" + offParameters(query, page, pageSize, false, region))
            "offLegacySearch" -> request("https://world.openfoodfacts.org/cgi/search.pl?" + offParameters(query, page, pageSize, true, region))
            "offBarcode" -> {
                require(Regex("^\\d{7,14}$").matches(query)) { "Érvénytelen vonalkód." }
                request("https://world.openfoodfacts.org/api/v2/product/" + encode(query) + ".json",
                    missingBarcode = query)
            }
            "usdaSearch" -> request(
                "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY",
                JSONObject().apply {
                    put("query", query)
                    put("dataType", JSONArray().put("Foundation").put("SR Legacy"))
                    put("pageSize", 20)
                    put("pageNumber", 1)
                }.toString()
            )
            else -> throw IllegalArgumentException("Ismeretlen Food API-művelet.")
        }
    }

    private val countries = mapOf(
        "hu" to "hungary", "sk" to "slovakia", "at" to "austria",
        "de" to "germany", "cz" to "czech-republic", "pl" to "poland",
        "ro" to "romania", "gb" to "united-kingdom", "us" to "united-states"
    )
    private fun encode(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name())
    private fun offParameters(query: String, page: Int, size: Int, legacy: Boolean, region: String): String {
        val fields = "code,product_name_hu,product_name,product_name_en,generic_name_hu,generic_name,categories_tags,countries_tags,brands,brands_tags,lang,product_quantity_unit,image_front_small_url,nutriments,nutrition_data_per,last_modified_t"
        val country = countries[region]
        val params = if (legacy) {
            mutableListOf(
                "search_terms" to query, "search_simple" to "1", "action" to "process", "json" to "1",
                "page" to page.toString(), "page_size" to size.toString(), "fields" to fields
            ).apply {
                if (country != null) addAll(listOf(
                    "tagtype_0" to "countries", "tag_contains_0" to "contains", "tag_0" to country
                ))
            }
        } else {
            // Search-a-licious: langs selects query languages, not countries.
            // Escape Lucene syntax in the user's text before adding a verified country clause.
            val safeQuery = query.replace(Regex("[+!():{}?~*^]"), " ").replace('"', ' ')
            val filteredQuery = if (country == null) safeQuery else safeQuery + " countries_tags:" + '"' + "en:" + country + '"'
            mutableListOf(
                "q" to filteredQuery, "page" to page.toString(), "page_size" to size.toString(),
                "langs" to "hu,en", "boost_phrase" to "true", "fields" to fields
            )
        }
        return params.joinToString("&") { (key, value) -> encode(key) + "=" + encode(value) }
    }

    private fun request(url: String, body: String? = null, missingBarcode: String? = null): JSONObject {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 6500
            connection.readTimeout = 9000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "GrapesFood/0.23 (https://github.com/fabianpetermark-commits/Grapes)")
            if (body != null) {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            // OFF's product API may return HTTP 404 (or HTTP 200 with status=0)
            // for a barcode that is simply absent; that is not a network outage.
            if (status == 404 && missingBarcode != null) {
                return JSONObject().put("status", 0).put("code", missingBarcode)
            }
            if (status !in 200..299) {
                val explanation = when (status) {
                    404 -> "A szolgáltatás keresési végpontja nem található."
                    429 -> "A szolgáltató keresési korlátja betelt."
                    403 -> "A szolgáltató elutasította a kérést."
                    else -> "Az adatbázis nem érhető el."
                }
                throw IllegalStateException(explanation + " (HTTP " + status + ")")
            }
            val bytes = ByteArrayOutputStream()
            connection.inputStream.use { input ->
                val buffer = ByteArray(8192)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    if (bytes.size() + read > 3_000_000) throw IllegalStateException("Túl nagy API-válasz.")
                    bytes.write(buffer, 0, read)
                }
            }
            return JSONObject(bytes.toString(Charsets.UTF_8.name()))
        } finally {
            connection.disconnect()
        }
    }
}
