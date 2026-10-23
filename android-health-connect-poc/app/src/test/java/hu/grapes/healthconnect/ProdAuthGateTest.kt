package hu.grapes.healthconnect

import android.content.Context
import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class ProdAuthGateTest {
    private val context: Context get() = RuntimeEnvironment.getApplication()
    private val prefs get() = context.getSharedPreferences("grapes-prod-auth-owner-unit-test", Context.MODE_PRIVATE)
    private val owner = "11111111-1111-4111-8111-111111111111"
    private val other = "22222222-2222-4222-8222-222222222222"

    @Before
    fun resetOwner() {
        prefs.edit().clear().commit()
    }

    @Test
    fun unboundAccountCannotUnlockOldLocalApp() {
        val gate = ProdAuthGate(true, prefs)
        assertEquals("auth", gate.initialUrl("app", "auth"))
        assertFalse(gate.canDisplayApp())
        assertTrue(gate.canOfferBinding(true, owner))
        assertFalse(gate.canOfferBinding(false, owner))
        assertFalse(gate.canOfferBinding(true, "invalid-user"))
        assertFalse(gate.allowApp(true, owner))
        assertFalse(gate.canDisplayApp())
    }

    @Test
    fun onlyPreviouslyConfirmedOwnerCanReadExistingProfile() {
        val gate = ProdAuthGate(true, prefs)
        // The native UI may write this ONLY after the explicit backup
        // acknowledgement AND successful device-credential verification.
        assertTrue(prefs.edit().putString("owner-uid", owner).commit())
        assertFalse(gate.canOfferBinding(true, other))
        assertFalse(gate.allowApp(true, other))
        assertFalse(gate.allowApp(false, owner))
        assertFalse(gate.canDisplayApp())
        assertTrue(gate.allowApp(true, owner))
        assertTrue(gate.canDisplayApp())
        assertFalse(gate.startLogout(false))
        assertTrue(gate.startLogout(true))
        assertFalse(gate.canDisplayApp())
        assertFalse(gate.allowApp(true, other))
        assertTrue(gate.allowApp(true, owner))
        gate.lock()
        assertFalse(gate.canDisplayApp())
    }

    @Test
    fun authDisabledKeepsLegacyReleaseNavigationUnchanged() {
        val gate = ProdAuthGate(false, prefs)
        assertEquals("app", gate.initialUrl("app", "auth"))
        assertTrue(gate.canDisplayApp())
        assertFalse(gate.canOfferBinding(true, owner))
        assertFalse(gate.allowApp(true, owner))
    }
}

@RunWith(RobolectricTestRunner::class)
class ProdAuthCallbackTest {
    private val context: Context get() = RuntimeEnvironment.getApplication()
    private val state = "a".repeat(64)
    private val code = "T".repeat(32)
    private val project = "https://yopabovoxyffhokhbgxl.supabase.co"
    private val redirect = "hu.grapes.healthconnect://auth/callback?state=$state"

    @Before
    fun clearOAuth() {
        context.getSharedPreferences("grapes-prod-oauth-handoff-v1", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun productionCallbackIsOneShotAndTestSchemeIsRejected() {
        val callback = ProdAuthCallback(context) { 10_000L }
        val url = "$project/auth/v1/authorize?provider=google&redirect_to=${Uri.encode(redirect)}"
        assertTrue(callback.begin(url, state))
        assertFalse(callback.accept(Uri.parse("hu.grapes.healthconnect.test://auth/callback?state=$state&code=$code")))
        assertTrue(callback.accept(Uri.parse("hu.grapes.healthconnect://auth/callback?state=$state&code=$code")))
        assertEquals("code", callback.consume().getString("status"))
        assertEquals("none", callback.consume().getString("status"))
    }

    @Test
    fun callbackSurvivesActivityRecreationAndCannotBeReplayed() {
        val url = "$project/auth/v1/authorize?provider=google&redirect_to=${Uri.encode(redirect)}"
        assertTrue(ProdAuthCallback(context) { 10_000L }.begin(url, state))
        val returnFromBrowser = ProdAuthCallback(context) { 10_001L }
        assertTrue(returnFromBrowser.accept(Uri.parse("$redirect&code=$code")))
        val resumed = ProdAuthCallback(context) { 10_002L }
        assertEquals("code", resumed.consume().getString("status"))
        assertEquals("none", ProdAuthCallback(context) { 10_003L }.consume().getString("status"))
        assertFalse(ProdAuthCallback(context) { 10_004L }.accept(Uri.parse("$redirect&code=$code")))
    }

    @Test
    fun unknownProviderAndWrongProjectNeverStartOAuth() {
        val callback = ProdAuthCallback(context) { 10_000L }
        val badProject = "https://aighqtqjlzirlokxwupt.supabase.co/auth/v1/authorize?provider=google&redirect_to=${Uri.encode(redirect)}"
        assertFalse(callback.begin(badProject, state))
        assertFalse(callback.begin("$project/auth/v1/authorize?provider=github&redirect_to=${Uri.encode(redirect)}", state))
        assertFalse(callback.begin("$project/auth/v1/authorize?provider=google&redirect_to=${Uri.encode("hu.grapes.healthconnect.test://auth/callback?state=$state")}", state))
    }

    @Test
    fun expiredCallbackIsRejectedAndDoesNotReleaseTokens() {
        val callback = ProdAuthCallback(context) { 1_000L }
        val url = "$project/auth/v1/authorize?provider=google&redirect_to=${Uri.encode(redirect)}"
        assertTrue(callback.begin(url, state))
        val delayed = ProdAuthCallback(context) { 1_000L + 5 * 60 * 1000 + 1 }
        assertFalse(delayed.accept(Uri.parse("hu.grapes.healthconnect://auth/callback?state=$state&code=$code")))
        assertEquals("none", delayed.consume().getString("status"))
    }
}
