package hu.grapes.healthconnect

import org.junit.Assert.*
import org.junit.Test

class TestAuthGateTest {
    private val appUrl = "https://appassets.androidplatform.net/assets/design/android-mobile-preview.html"
    private val authUrl = "https://grapes-test-auth.invalid/assets/login-auth-test.html"
    private val userId = "123e4567-e89b-12d3-a456-426614174000"

    @Test fun qaAlwaysStartsAtLoginUntilFreshVerification() {
        val gate = TestAuthGate(true)
        assertEquals(authUrl, gate.initialUrl(appUrl, authUrl))
        assertFalse(gate.canDisplayApp())
        assertFalse(gate.allowApp(fromTrustedAuthPage = false, subject = userId))
        assertFalse(gate.canDisplayApp())
        assertFalse(gate.allowApp(fromTrustedAuthPage = true, subject = "invalid"))
        assertTrue(gate.allowApp(fromTrustedAuthPage = true, subject = userId))
        assertTrue(gate.canDisplayApp())
        assertNull(gate.subject(fromTrustedAppPage = false))
        assertEquals(userId, gate.subject(fromTrustedAppPage = true))
        // A restarted Activity must validate the persisted Supabase session again.
        assertFalse(TestAuthGate(true).canDisplayApp())
    }

    @Test fun logoutRelocksAndCannotBeTriggeredOutsideTrustedApp() {
        val gate = TestAuthGate(true)
        assertFalse(gate.startLogout(fromTrustedAppPage = true))
        assertTrue(gate.allowApp(fromTrustedAuthPage = true, subject = userId))
        assertFalse(gate.startLogout(fromTrustedAppPage = false))
        assertTrue(gate.canDisplayApp())
        assertTrue(gate.startLogout(fromTrustedAppPage = true))
        assertFalse(gate.canDisplayApp())
        assertNull(gate.subject(fromTrustedAppPage = true))
        gate.lock()
        assertFalse(gate.canDisplayApp())
    }

    @Test fun prodNeverIntroducesTestLoginOrNativeTestAuthRoute() {
        val gate = TestAuthGate(false)
        assertEquals(appUrl, gate.initialUrl(appUrl, authUrl))
        assertTrue(gate.canDisplayApp())
        assertFalse(gate.allowApp(fromTrustedAuthPage = true, subject = userId))
        assertFalse(gate.startLogout(fromTrustedAppPage = true))
    }
}
