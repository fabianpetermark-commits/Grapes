package hu.grapes.healthconnect

import android.net.Uri
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class TestAuthCallbackTest {
    private val context = RuntimeEnvironment.getApplication()
    private var clock = 1000L
    private val state = "a".repeat(64)

    @Before fun clear() {
        context.getSharedPreferences("grapes-test-oauth-handoff-v1", 0).edit().clear().commit()
        clock = 1000L
    }

    private fun callback() = TestAuthCallback(context) { clock }
    private fun authorize(target: String = TestAuthCallback.CALLBACK_BASE + "?state=" + state,
                          host: String = TestAuthCallback.PROJECT_HOST,
                          extra: String = "") =
        "https://$host/auth/v1/authorize?provider=google&redirect_to=" +
            Uri.encode(target) + extra

    @Test fun exactTestProviderAndReturnRequired() {
        val flow = callback()
        assertTrue(flow.begin(authorize(), state))
        assertFalse(flow.begin(authorize(host = "other.supabase.co"), state))
        assertFalse(flow.begin(authorize(target = "https://evil.invalid"), state))
        assertFalse(flow.begin(authorize(extra = "&scopes=drive.file"), state))
        assertFalse(flow.begin(authorize(extra = "&scope=drive.file"), state))
        assertFalse(flow.begin(authorize().replace("provider=google", "provider=github"), state))
        assertFalse(flow.begin(authorize().replace("https://", "http://"), state))
    }

    @Test fun callbackIsExactFreshAndSingleUseAcrossInstances() {
        assertTrue(callback().begin(authorize(), state))
        val wrong = Uri.parse(TestAuthCallback.CALLBACK_BASE.replace("://auth/", "://evil/") +
            "?state=" + state + "&code=synthetic-auth-code")
        assertFalse(callback().accept(wrong))
        val correct = Uri.parse(TestAuthCallback.CALLBACK_BASE + "?state=" + state + "&code=synthetic-auth-code")
        assertTrue(callback().accept(correct))
        assertFalse(callback().accept(correct))
        assertEquals("code", callback().consume().getString("status"))
        assertEquals("none", callback().consume().getString("status"))
        assertFalse(callback().accept(correct))
    }

    @Test fun cancellationExpiryAndMalformedCallbacksFailClosed() {
        val flow = callback()
        assertTrue(flow.begin(authorize(), state))
        assertFalse(flow.accept(Uri.parse(TestAuthCallback.CALLBACK_BASE + "?state=" +
            "b".repeat(64) + "&code=synthetic-auth-code")))
        assertFalse(flow.accept(Uri.parse(TestAuthCallback.CALLBACK_BASE + "?state=" +
            state + "&code=synthetic-auth-code&extra=1")))
        assertTrue(flow.accept(Uri.parse(TestAuthCallback.CALLBACK_BASE + "?state=" + state + "&error=access_denied")))
        assertEquals("cancel", flow.consume().getString("status"))
        assertTrue(flow.begin(authorize(), state))
        clock += 5 * 60 * 1000L + 1
        assertFalse(flow.accept(Uri.parse(TestAuthCallback.CALLBACK_BASE + "?state=" +
            state + "&code=synthetic-auth-code")))
        assertEquals("none", flow.consume().getString("status"))
    }

    @Test fun inFlightPageReloadDoesNotConsumePendingState() {
        val flow = callback()
        assertTrue(flow.begin(authorize(), state))
        assertEquals("none", flow.consume().getString("status"))
        assertTrue(callback().accept(Uri.parse(TestAuthCallback.CALLBACK_BASE + "?state=" +
            state + "&code=synthetic-auth-code")))
        assertEquals("code", flow.consume().getString("status"))
    }
}
