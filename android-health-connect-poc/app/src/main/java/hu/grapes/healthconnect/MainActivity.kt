package hu.grapes.healthconnect

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.health.connect.client.HealthConnectClient
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    private val healthConnect by lazy { HealthConnectBridge(this) }
    private val googleAuthorization by lazy { Identity.getAuthorizationClient(this) }
    private lateinit var webView: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingHealthRequest: PendingHealthRequest? = null
    private var pendingDriveRequestId: String? = null

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
        if (activityResult.resultCode != RESULT_OK || data == null) {
            sendError(requestId, "A Google-bejelentkezés megszakadt.")
            return@registerForActivityResult
        }
        runCatching { googleAuthorization.getAuthorizationResultFromIntent(data) }
            .onSuccess { sendGoogleAuthorizationResult(requestId, it) }
            .onFailure { sendError(requestId, it.message ?: "Google-bejelentkezési hiba.") }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureWebView()
        setContentView(webView)
        webView.loadUrl(APP_URL)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
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
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
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
            "readHealthData" -> {
                val fromDate = message.optJSONArray("args")?.optString(0).orEmpty()
                val from = runCatching { LocalDate.parse(fromDate) }.getOrElse {
                    return sendError(requestId, "Érvénytelen kezdődátum.")
                }
                readHealthData(from, requestId)
            }
            "authorizeGoogleDrive" -> authorizeGoogleDrive(
                message.optJSONArray("args")?.optBoolean(0, false) == true,
                requestId
            )
            "disconnectGoogleDrive" -> disconnectGoogleDrive(
                message.optJSONArray("args")?.optString(0).orEmpty(),
                requestId
            )
            else -> sendError(requestId, "Ismeretlen Android-művelet.")
        }
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
            .addOnFailureListener { sendError(requestId, it.message ?: "Google-bejelentkezési hiba.") }
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
                val missing = healthConnect.requestedPermissions() - healthConnect.grantedPermissions()
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
        private const val APP_URL = "https://$APP_HOST/assets/index.html"
        private const val DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
        private const val DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
    }
}


