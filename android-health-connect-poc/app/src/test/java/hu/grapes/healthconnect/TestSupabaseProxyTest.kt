package hu.grapes.healthconnect

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TestSupabaseProxyTest {
    private val a = "123e4567-e89b-12d3-a456-426614174000"
    private val b = "123e4567-e89b-12d3-a456-426614174001"
    private val tokenA = "a".repeat(30) + "." + "b".repeat(30) + "." + "c".repeat(30)
    private val key = "sb_publishable_synthetic_ci_only_000000000000"

    @Test fun disabledProxyRejectsCredentialsWithoutNetwork(): Unit = runBlocking {
        val proxy = TestSupabaseProxy(false, key) { _, _, _, _ -> error("network called") }
        assertThrows(IllegalStateException::class.java) {
            runBlocking { proxy.authorize(a, tokenA) }
        }
        assertNull(proxy.currentSubject())
    }

    @Test fun verifiedIdentityKeepsBearerNativeAndAllowsOnlyNamedRpc(): Unit = runBlocking {
        val paths = mutableListOf<String>()
        val proxy = TestSupabaseProxy(true, key) { path, bearer, body, suppliedKey ->
            assertEquals(tokenA, bearer)
            assertEquals(key, suppliedKey)
            paths.add(path)
            when (path) {
                "/auth/v1/user" -> 200 to "{\"id\":\"$a\",\"is_anonymous\":false}"
                "/rest/v1/rpc/compare_and_swap" -> {
                    assertEquals("entry-1", JSONObject(body!!).getString("p_record_id"))
                    200 to "{\"status\":\"committed\",\"revision\":1}"
                }
                else -> error("unexpected path")
            }
        }
        proxy.authorize(a, tokenA)
        assertEquals(a, proxy.currentSubject())
        assertEquals(a, proxy.whoAmI(a))
        val response = proxy.rpc(a, "compare_and_swap", JSONObject().put("p_record_id", "entry-1"))
        assertEquals("committed", JSONObject(response).getString("status"))
        assertFalse(response.contains(tokenA))
        assertEquals(listOf("/auth/v1/user", "/auth/v1/user", "/auth/v1/user",
            "/rest/v1/rpc/compare_and_swap"), paths)
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking { proxy.rpc(a, "../../admin", JSONObject()) }
        }
        assertThrows(IllegalStateException::class.java) {
            runBlocking { proxy.rpc(b, "compare_and_swap", JSONObject()) }
        }
        proxy.clear()
        assertNull(proxy.currentSubject())
        assertThrows(IllegalStateException::class.java) {
            runBlocking { proxy.whoAmI(a) }
        }
    }

    @Test fun foreignAndAnonymousAuthResponsesNeverUnlockProxy(): Unit = runBlocking {
        for (response in listOf(200 to "{\"id\":\"$b\"}",
                200 to "{\"id\":\"$a\",\"is_anonymous\":true}",
                401 to "{}")) {
            val proxy = TestSupabaseProxy(true, key) { _, _, _, _ -> response }
            assertThrows(IllegalStateException::class.java) {
                runBlocking { proxy.authorize(a, tokenA) }
            }
            assertNull(proxy.currentSubject())
        }
    }
    @Test fun familyRpcRequiresSeparateQaOptInAndOriginalVerifiedUser(): Unit = runBlocking {
        val route = "home_m3b_compare_and_swap"
        var remoteCalls = 0
        val transport: suspend (String, String, String?, String) -> Pair<Int, String> = { path, bearer, body, suppliedKey ->
            assertEquals(tokenA, bearer)
            assertEquals(key, suppliedKey)
            remoteCalls++
            when (path) {
                "/auth/v1/user" -> 200 to "{\"id\":\"$a\",\"is_anonymous\":false}"
                "/rest/v1/rpc/$route" -> {
                    assertEquals("family-a", JSONObject(body!!).getString("p_household_id"))
                    200 to "{\"status\":\"committed\",\"revision\":1}"
                }
                else -> error("Unexpected native route: $path")
            }
        }
        val blocked = TestSupabaseProxy(true, key, familyEnabled = false, transport = transport)
        blocked.authorize(a, tokenA)
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking { blocked.rpc(a, route, JSONObject().put("p_household_id", "family-a")) }
        }
        assertEquals(1, remoteCalls)
        val permitted = TestSupabaseProxy(true, key, familyEnabled = true, transport = transport)
        permitted.authorize(a, tokenA)
        assertEquals("committed", JSONObject(permitted.rpc(a, route,
            JSONObject().put("p_household_id", "family-a"))).getString("status"))
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking { permitted.rpc(a, "home_m3b_not_a_real_rpc", JSONObject()) }
        }
        assertThrows(IllegalStateException::class.java) {
            runBlocking { permitted.rpc(b, route, JSONObject()) }
        }
        permitted.clear()
        assertThrows(IllegalStateException::class.java) {
            runBlocking { permitted.whoAmI(a) }
        }
    }

}
