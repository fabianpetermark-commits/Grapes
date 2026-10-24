package hu.grapes.healthconnect

import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** TEST-only bearer boundary. The app WebView never receives the JWT. */
internal class TestSupabaseProxy(
    private val enabled: Boolean,
    private val publishableKey: String,
    private val transport: suspend (String, String, String?, String) -> Pair<Int, String> =
        { path, token, body, key -> http(path, token, body, key) },
) {
    private val lock = Any()
    private var generation = 0L
    private var subject: String? = null
    private var token: String? = null
    private val uuid = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    private val jwt = Regex("^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$")
    private val allowed = setOf("create_profile", "list_profiles", "read_document",
        "list_documents", "read_revision", "list_revisions", "read_attempt", "compare_and_swap")

    fun currentSubject(): String? = synchronized(lock) { subject }

    fun clear() = synchronized(lock) {
        generation++
        subject = null
        token = null
    }

    suspend fun authorize(userId: String, accessToken: String) {
        check(enabled && publishableKey.matches(Regex("sb_publishable_[A-Za-z0-9_-]{16,}"))) {
            "A TEST adatkapu ki van kapcsolva."
        }
        require(uuid.matches(userId) && accessToken.length in 50..8192 && jwt.matches(accessToken)) {
            "Érvénytelen TEST-munkamenet."
        }
        val attempt = synchronized(lock) { clear(); generation }
        val verified = fetchUser(accessToken)
        check(verified == userId.lowercase()) { "A TEST-fiók nem egyezik a munkamenettel." }
        synchronized(lock) {
            check(generation == attempt) { "A TEST-fiók időközben megváltozott." }
            subject = verified
            token = accessToken
        }
    }

    suspend fun whoAmI(expectedUserId: String): String {
        val (current, bearer, version) = capture(expectedUserId)
        val verified = fetchUser(bearer)
        if (verified != current) { clear(); error("A TEST-munkamenet lejárt vagy megváltozott.") }
        synchronized(lock) { check(generation == version) { "A TEST-fiók időközben megváltozott." } }
        return current
    }

    suspend fun rpc(expectedUserId: String, function: String, arguments: JSONObject): String {
        require(function in allowed) { "Nem engedélyezett TEST-adatművelet." }
        val body = arguments.toString()
        require(body.toByteArray(Charsets.UTF_8).size <= 1048576) { "Túl nagy TEST-adatművelet." }
        val (current, bearer, version) = capture(expectedUserId)
        check(fetchUser(bearer) == current) { "A TEST-munkamenet lejárt vagy megváltozott." }
        synchronized(lock) { check(generation == version) { "A TEST-fiók időközben megváltozott." } }
        val (status, result) = transport("/rest/v1/rpc/$function", bearer, body, publishableKey)
        synchronized(lock) { check(generation == version) { "A TEST-fiók időközben megváltozott." } }
        check(status == 200) { "A TEST-adatművelet nem sikerült. HTTP $status" }
        return result
    }

    private fun capture(expected: String): Triple<String, String, Long> = synchronized(lock) {
        check(enabled && uuid.matches(expected) && subject == expected.lowercase() && token != null) {
            "A TEST-fiók nincs hitelesítve."
        }
        Triple(subject!!, token!!, generation)
    }

    private suspend fun fetchUser(bearer: String): String {
        val (status, body) = transport("/auth/v1/user", bearer, null, publishableKey)
        check(status == 200) { "A TEST-munkamenet nem ellenőrizhető. HTTP $status" }
        val user = JSONObject(body)
        check(!user.optBoolean("is_anonymous", false)) { "Névtelen TEST-fiók nem használható." }
        val id = user.optString("id")
        check(uuid.matches(id)) { "Érvénytelen TEST-fiókazonosító." }
        return id.lowercase()
    }

    companion object {
        private const val PROJECT = "https://aighqtqjlzirlokxwupt.supabase.co"

        private suspend fun http(path: String, bearer: String, body: String?, key: String): Pair<Int, String> =
            withContext(Dispatchers.IO) {
                val connection = URL(PROJECT + path).openConnection() as HttpURLConnection
                try {
                    connection.instanceFollowRedirects = false
                    connection.connectTimeout = 6500
                    connection.readTimeout = 9000
                    connection.setRequestProperty("apikey", key)
                    connection.setRequestProperty("Authorization", "Bearer $bearer")
                    connection.setRequestProperty("Accept", "application/json")
                    if (body != null) {
                        connection.requestMethod = "POST"
                        connection.doOutput = true
                        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                        connection.setRequestProperty("Content-Profile", "api")
                        connection.setRequestProperty("Accept-Profile", "api")
                        connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                    }
                    val status = connection.responseCode
                    val bytes = ByteArrayOutputStream()
                    (if (status in 200..299) connection.inputStream else connection.errorStream)?.use { input ->
                        val buffer = ByteArray(8192)
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            check(bytes.size() + read <= 1100000) { "Túl nagy TEST-válasz." }
                            bytes.write(buffer, 0, read)
                        }
                    }
                    status to bytes.toString(Charsets.UTF_8.name())
                } finally { connection.disconnect() }
            }
    }
}
