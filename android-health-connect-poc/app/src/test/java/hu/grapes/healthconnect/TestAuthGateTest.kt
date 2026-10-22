package hu.grapes.healthconnect

import org.junit.Assert.*
import org.junit.Test

class TestAuthGateTest {
    private val appUrl = "https://appassets.androidplatform.net/assets/design/android-mobile-preview.html"
    private val authUrl = "https://grapes-test-auth.invalid/assets/login-auth-test.html"

    @Test fun qaAlwaysStartsAtLoginUntilFreshVerification() {
        val gate = TestAuthGate(true)
        assertEquals(authUrl, gate.initialUrl(appUrl, authUrl))
        assertFalse(gate.canDisplayApp())
        assertFalse(gate.allowApp(fromTrustedAuthPage = false))
        assertFalse(gate.canDisplayApp())
        assertTrue(gate.allowApp(fromTrustedAuthPage = true))
        assertTrue(gate.canDisplayApp())
        // A restarted Activity must validate the persisted Supabase session again.
        assertFalse(TestAuthGate(true).canDisplayApp())
    }

    @Test fun logoutRelocksAndCannotBeTriggeredOutsideTrustedApp() {
        val gate = TestAuthGate(true)
        assertFalse(gate.startLogout(fromTrustedAppPage = true))
        assertTrue(gate.allowApp(fromTrustedAuthPage = true))
        assertFalse(gate.startLogout(fromTrustedAppPage = false))
        assertTrue(gate.canDisplayApp())
        assertTrue(gate.startLogout(fromTrustedAppPage = true))
        assertFalse(gate.canDisplayApp())
        gate.lock()
        assertFalse(gate.canDisplayApp())
    }

    @Test fun prodNeverIntroducesTestLoginOrNativeTestAuthRoute() {
        val gate = TestAuthGate(false)
        assertEquals(appUrl, gate.initialUrl(appUrl, authUrl))
        assertTrue(gate.canDisplayApp())
        assertFalse(gate.allowApp(fromTrustedAuthPage = true))
        assertFalse(gate.startLogout(fromTrustedAppPage = true))
    }
}
