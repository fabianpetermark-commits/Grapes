package hu.grapes.healthconnect

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import com.google.android.gms.common.api.ApiException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    private val healthConnect by lazy { HealthConnectBridge(this) }
    private val yazioApi = YazioApi()
    private val samsungWaterBridge by lazy { SamsungWaterBridgeFactory.create(this) }
    private val googleAuthorization by lazy { Identity.getAuthorizationClient(this) }
    private val updateManager by lazy { AndroidUpdateManager(this) }
    private lateinit var webView: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingCameraPermission: PermissionRequest? = null
    private var pendingHealthRequest: PendingHealthRequest? = null
    private var pendingDriveRequestId: String? = null
    private var availableUpdate: AndroidUpdateManager.Release? = null

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val request = pendingCameraPermission
        pendingCameraPermission = null
        if (granted) request?.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else request?.deny()
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) checkForAppUpdate(force = true)
    }

    private data class PendingHealthRequest(val from: LocalDate, val requestId: String)

    private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val files = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        fileChooserCallback?.onReceiveValue(files)
        fileChooserCallback = null
    }

    private val permissionLauncher = registerForActivityResult(HealthConnectBridge.permissionContract) {
        val request = pendingHealthRequest ?: return@registerForActivityResult
        pendingHealthRequest = null
        readHealthData(request.from, request.requestId, allowPermissionRequest = false)
    }

    private val googleAuthorizationLauncher = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { activityResult ->
        val requestId = pendingDriveRequestId ?: return@registerForActivityResult
        pendingDriveRequestId = null
        val data = activityResult.data
        if (data == null) {
            sendError(requestId, "A Google-bejelentkezés megszakadt.")
            return@registerForActivityResult
        }
        runCatching { googleAuthorization.getAuthorizationResultFromIntent(data) }
            .onSuccess { sendGoogleAuthorizationResult(requestId, it) }
            .onFailure { sendError(requestId, googleAuthorizationError(it)) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureWebView()
        setContentView(webView)
        UpdateNotifications.createChannel(this)
        UpdateCheckWorker.schedule(this)
        webView.loadUrl(APP_URL)
        // A foreground launch must always see a release published since the previous
        // background check. The six-hour throttle only belongs to WorkManager.
        checkForAppUpdate(force = true)
        maybeRequestUpdateNotificationPermission()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    "(() => typeof window.grapesHandleAndroidBack === 'function' && window.grapesHandleAndroidBack())()"
                ) { handled ->
                    if (handled == "true") return@evaluateJavascript
                    if (webView.canGoBack()) webView.goBack() else finish()
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra(UpdateNotifications.EXTRA_OPEN_UPDATE, false)) {
            checkForAppUpdate(force = true)
        }
    }

    override fun onResume() {
        super.onResume()
        runCatching { updateManager.resumePendingInstall() }
            .onFailure { showUpdateError(it) }
    }

    private fun checkForAppUpdate(force: Boolean = false) {
        lifecycleScope.launch {
            runCatching { updateManager.findAvailableRelease(force) }
                .onSuccess { release ->
                    availableUpdate = release
                    if (release != null && !isFinishing) {
                        UpdateNotifications.showAvailable(this@MainActivity, release)
                        publishAvailableUpdate(release)
                    }
                }
        }
    }

    private fun maybeRequestUpdateNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        val preferences = getSharedPreferences(NOTIFICATION_PREFERENCES, MODE_PRIVATE)
        if (preferences.getBoolean(NOTIFICATION_PERMISSION_EXPLAINED, false)) return
        preferences.edit().putBoolean(NOTIFICATION_PERMISSION_EXPLAINED, true).apply()
        AlertDialog.Builder(this)
            .setTitle("Értesítés az új verziókról")
            .setMessage("A Grapes szólhat, amikor új, aláírt alkalmazásfrissítés érhető el.")
            .setPositiveButton("Engedélyezem") { _, _ ->
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            .setNegativeButton("Most nem", null)
            .show()
    }

    private suspend fun downloadAndInstallUpdate(release: AndroidUpdateManager.Release) {
        val apk = updateManager.download(release)
        updateManager.requestInstall(apk)
    }

    private fun showUpdateError(error: Throwable) {
        Toast.makeText(
            this,
            error.message ?: "A frissítés nem sikerült.",
            Toast.LENGTH_LONG
        ).show()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            WebViewCompat.addWebMessageListener(
                this,
                "GrapesAndroid",
                setOf(APP_ORIGIN)
            ) { _, message, _, isMainFrame, _ ->
                if (!isMainFrame) return@addWebMessageListener
                handleBridgeMessage(message.data ?: return@addWebMessageListener)
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
                    assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == APP_HOST) return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                        .onFailure {
                            Toast.makeText(
                                this@MainActivity,
                                "A hivatkozás nem nyitható meg.",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    runOnUiThread {
                        if (request.origin.host != APP_HOST || !request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                            request.deny()
                            return@runOnUiThread
                        }
                        pendingCameraPermission?.deny()
                        pendingCameraPermission = request
                        if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                            pendingCameraPermission = null
                            request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                        } else cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                }

                override fun onShowFileChooser(
                    webView: WebView,
                    callback: ValueCallback<Array<Uri>>,
                    params: FileChooserParams
                ): Boolean {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = callback
                    return runCatching {
                        fileChooser.launch(params.createIntent())
                        true
                    }.getOrElse {
                        fileChooserCallback = null
                        callback.onReceiveValue(null)
                        false
                    }
                }
            }
        }
    }

    private fun handleBridgeMessage(rawMessage: String) {
        val message = runCatching { JSONObject(rawMessage) }.getOrElse { return }
        val requestId = message.optString("requestId")
        if (requestId.isBlank()) return
        when (message.optString("method")) {
            "yazio" -> lifecycleScope.launch {
                runCatching { yazioApi.execute(message.optJSONArray("args") ?: JSONArray()) }
                    .onSuccess { sendResult(requestId, it) }
                    .onFailure { sendError(requestId, it.message ?: "A YAZIO-kapcsolat nem sikerült.") }
            }
            "readHealthDataSilent" -> {
                val from = runCatching { LocalDate.parse(message.optJSONArray("args")?.optString(0).orEmpty()) }.getOrNull()
                if (from == null) sendError(requestId, "Érvénytelen kezdődátum.")
                else readHealthData(from, requestId, allowPermissionRequest = false)
            }
            "readHealthData" -> {
                val fromDate = message.optJSONArray("args")?.optString(0).orEmpty()
                val from = runCatching { LocalDate.parse(fromDate) }.getOrElse {
                    return sendError(requestId, "Érvénytelen kezdődátum.")
                }
                if (from.isAfter(LocalDate.now())) return sendError(requestId, "Jövőbeli kezdődátum nem választható.")
                readHealthData(from, requestId)
            }
            "readSamsungHealthData" -> {
                val fromDate = message.optJSONArray("args")?.optString(0).orEmpty()
                val from = runCatching { LocalDate.parse(fromDate) }.getOrElse {
                    return sendError(requestId, "Érvénytelen kezdődátum.")
                }
                readSamsungHealthData(from, requestId)
            }
            "openHealthConnectSettings" -> openHealthConnectSettings(requestId)
            "authorizeGoogleDrive" -> authorizeGoogleDrive(
                message.optJSONArray("args")?.optBoolean(0, false) == true,
                requestId
            )
            "disconnectGoogleDrive" -> disconnectGoogleDrive(
                message.optJSONArray("args")?.optString(0).orEmpty(),
                requestId
            )
            "getAvailableUpdate" -> sendResult(
                requestId,
                availableUpdate?.toJson()?.toString() ?: "null"
            )
            "installAvailableUpdate" -> {
                val requestedVersion = message.optJSONArray("args")?.optInt(0, -1) ?: -1
                val release = availableUpdate
                if (release == null || release.versionCode != requestedVersion) {
                    sendError(requestId, "Ez a frissítés már nem érhető el. Ellenőrizd újra az értesítéseket.")
                } else {
                    Toast.makeText(this, "A Grapes frissítése letöltődik…", Toast.LENGTH_LONG).show()
                    lifecycleScope.launch {
                        runCatching { downloadAndInstallUpdate(release) }
                            .onSuccess { sendResult(requestId, "{}") }
                            .onFailure {
                                sendError(requestId, it.message ?: "A frissítés nem sikerült.")
                                showUpdateError(it)
                            }
                    }
                }
            }
            else -> sendError(requestId, "Ismeretlen Android-művelet.")
        }
    }

    private fun AndroidUpdateManager.Release.toJson() = JSONObject().apply {
        put("versionCode", versionCode)
        put("versionName", versionName)
        put("notes", notes)
    }

    private fun publishAvailableUpdate(release: AndroidUpdateManager.Release) {
        val detail = release.toJson()
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('grapes:android-update',{detail:$detail}))",
            null
        )
    }

    private fun authorizeGoogleDrive(fullRead: Boolean, requestId: String) {
        val scopes = mutableListOf(Scope(DRIVE_FILE_SCOPE))
        if (fullRead) scopes += Scope(DRIVE_READ_SCOPE)
        val request = AuthorizationRequest.builder()
            .setRequestedScopes(scopes)
            .setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT)
            .build()
        googleAuthorization.authorize(request)
            .addOnSuccessListener { result ->
                if (!result.hasResolution()) {
                    sendGoogleAuthorizationResult(requestId, result)
                    return@addOnSuccessListener
                }
                val pendingIntent = result.pendingIntent
                if (pendingIntent == null) {
                    sendError(requestId, "A Google nem tudta megnyitni a bejelentkezést.")
                    return@addOnSuccessListener
                }
                pendingDriveRequestId = requestId
                googleAuthorizationLauncher.launch(
                    IntentSenderRequest.Builder(pendingIntent.intentSender).build()
                )
            }
            .addOnFailureListener { sendError(requestId, googleAuthorizationError(it)) }
    }

    private fun googleAuthorizationError(error: Throwable): String {
        val statusCode = (error as? ApiException)?.statusCode
        return when (statusCode) {
            10 -> "Google OAuth-konfigurációs hiba (10). Az Android kliens csomagnevét és SHA-1 ujjlenyomatát ellenőrizni kell."
            4 -> "Nincs használható Google-fiók bejelentkezve az eszközön (4)."
            7 -> "A Google-bejelentkezés hálózati hiba miatt nem sikerült (7)."
            15 -> "A Google-bejelentkezés túllépte az időkorlátot (15)."
            16 -> "A Google-bejelentkezés megszakadt (16)."
            null -> error.message ?: "Google-bejelentkezési hiba."
            else -> "Google-bejelentkezési hiba ($statusCode): ${error.message ?: "ismeretlen hiba"}"
        }
    }

    private fun sendGoogleAuthorizationResult(requestId: String, result: AuthorizationResult) {
        val token = result.accessToken
        if (token.isNullOrBlank()) {
            sendError(requestId, "A Google nem adott Drive-hozzáférési tokent.")
            return
        }
        sendResult(requestId, JSONObject().apply {
            put("accessToken", token)
            put("grantedScopes", JSONArray(result.grantedScopes))
            put("expiresIn", 3300)
        }.toString())
    }

    private fun disconnectGoogleDrive(token: String, requestId: String) {
        if (token.isBlank()) {
            sendResult(requestId, "{}")
            return
        }
        googleAuthorization.clearToken(ClearTokenRequest.builder().setToken(token).build())
            .addOnSuccessListener { sendResult(requestId, "{}") }
            .addOnFailureListener { sendError(requestId, it.message ?: "A Google-kijelentkezés nem sikerült.") }
    }

    private fun readHealthData(
        from: LocalDate,
        requestId: String,
        allowPermissionRequest: Boolean = true
    ) {
        lifecycleScope.launch {
            runCatching {
                check(healthConnect.sdkStatus() == HealthConnectClient.SDK_AVAILABLE) {
                    "A Health Connect nem érhető el vagy frissítésre szorul."
                }
                val missing = healthConnect.requestedPermissions(from) - healthConnect.grantedPermissions()
                if (missing.isNotEmpty()) {
                    check(allowPermissionRequest) { "A szükséges Health Connect-engedélyek nem lettek megadva." }
                    pendingHealthRequest = PendingHealthRequest(from, requestId)
                    permissionLauncher.launch(missing)
                    return@launch
                }
                healthConnect.readExport(from).toJson()
            }.onSuccess { payload ->
                if (payload != null) sendResult(requestId, payload)
            }.onFailure { sendError(requestId, it.message ?: it.javaClass.simpleName) }
        }
    }

    private fun readSamsungHealthData(from: LocalDate, requestId: String) {
        lifecycleScope.launch {
            runCatching {
                check(samsungWaterBridge.available) { samsungWaterBridge.availabilityMessage }
                check(samsungWaterBridge.requestReadPermission(this@MainActivity)) {
                    "A Samsung Health olvasási engedélyét nem kaptuk meg."
                }
                BridgeExport(java.time.Instant.now().toString(), samsungWaterBridge.readWater(from)).toJson()
            }.onSuccess { sendResult(requestId, it) }
                .onFailure { sendError(requestId, it.message ?: it.javaClass.simpleName) }
        }
    }

    private fun openHealthConnectSettings(requestId: String) {
        val intents = listOf(
            Intent("android.health.connect.action.HEALTH_CONNECT_SETTINGS"),
            Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS").setPackage(HealthConnectBridge.PROVIDER_PACKAGE)
        )
        val opened = intents.any { intent ->
            intent.resolveActivity(packageManager) != null && runCatching { startActivity(intent); true }.getOrDefault(false)
        }
        if (opened) sendResult(requestId, "{}")
        else sendError(requestId, "A Health Connect beállításai nem nyithatók meg ezen a telefonon.")
    }

    private fun sendResult(requestId: String, payload: String) = dispatchResult(JSONObject().apply {
        put("requestId", requestId)
        put("ok", true)
        put("payload", payload)
    })

    private fun sendError(requestId: String, message: String) = dispatchResult(JSONObject().apply {
        put("requestId", requestId)
        put("ok", false)
        put("error", message)
    })

    private fun dispatchResult(detail: JSONObject) {
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('grapes:android-result',{detail:${detail}}))",
            null
        )
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val APP_HOST = "appassets.androidplatform.net"
        private const val APP_ORIGIN = "https://$APP_HOST"
        private const val APP_URL = "https://$APP_HOST/assets/design/android-mobile-preview.html"
        private const val DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
        private const val DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
        private const val NOTIFICATION_PREFERENCES = "grapes-notifications"
        private const val NOTIFICATION_PERMISSION_EXPLAINED = "update-permission-explained"
    }
}

