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
        when (kind) {
            "offSearch" -> request("https://search.openfoodfacts.org/search?" + offParameters(query, page, pageSize, false))
            "offLegacySearch" -> request("https://world.openfoodfacts.org/cgi/search.pl?" + offParameters(query, page, pageSize, true))
            "offBarcode" -> {
                require(Regex("^\\d{7,14}$").matches(query)) { "Érvénytelen vonalkód." }
                request("https://world.openfoodfacts.org/api/v2/product/" + encode(query) + ".json")
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

    private fun encode(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name())
    private fun offParameters(query: String, page: Int, size: Int, legacy: Boolean): String {
        val fields = "code,product_name_hu,product_name,generic_name_hu,generic_name,categories_tags,product_quantity_unit,image_front_small_url,nutriments,last_modified_t"
        val params = if (legacy) listOf(
            "search_terms" to query, "search_simple" to "1", "action" to "process", "json" to "1",
            "page" to page.toString(), "page_size" to size.toString(), "fields" to fields
        ) else listOf(
            "q" to query, "page" to page.toString(), "page_size" to size.toString(),
            "langs" to "hu,en", "boost_phrase" to "true", "fields" to fields
        )
        return params.joinToString("&") { (key, value) -> encode(key) + "=" + encode(value) }
    }

    private fun request(url: String, body: String? = null): JSONObject {
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
            if (status !in 200..299) {
                val explanation = when (status) {
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
