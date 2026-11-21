package hu.grapes.ebook

import android.content.Intent
import android.net.Uri
import android.os.Bundle
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
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    companion object {
        private const val APP_HOST = "appassets.androidplatform.net"
        private const val APP_URL = "https://appassets.androidplatform.net/assets/ebook.html"
        private const val DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
        private const val DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
    }

    private lateinit var webView: WebView
    private val googleAuthorization by lazy { Identity.getAuthorizationClient(this) }
    private var pendingAuthorizationRequestId: String? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    private val authorizationLauncher = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
        val requestId = pendingAuthorizationRequestId ?: return@registerForActivityResult
        pendingAuthorizationRequestId = null
        val data = result.data
        if (result.resultCode != RESULT_OK || data == null) {
            sendError(requestId, "A Google Drive-engedélyezés megszakadt.")
            return@registerForActivityResult
        }
        runCatching { googleAuthorization.getAuthorizationResultFromIntent(data) }
            .onSuccess { sendGoogleAuthorizationResult(requestId, it) }
            .onFailure { sendError(requestId, googleAuthorizationError(it)) }
    }

    private val filePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = fileChooserCallback ?: return@registerForActivityResult
        fileChooserCallback = null
        val uris = if (result.resultCode == RESULT_OK) {
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        } else null
        callback.onReceiveValue(uris)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureWebView()
        setContentView(webView)
        if (savedInstanceState == null) webView.loadUrl(APP_URL)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (this@MainActivity::webView.isInitialized && webView.canGoBack()) webView.goBack()
                else finish()
            }
        })
    }

    @Suppress("SetJavaScriptEnabled")
    private fun configureWebView() {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            setBackgroundColor(android.graphics.Color.rgb(17, 24, 39))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

            WebViewCompat.addWebMessageListener(
                this,
                "EbookAndroid",
                setOf("https://$APP_HOST")
            ) { _, message, _, isMainFrame, _ ->
                if (isMainFrame) handleBridgeMessage(message.data ?: return@addWebMessageListener)
            }

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
                    assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val uri = request.url
                    if (uri.scheme == "https" && uri.host == APP_HOST && uri.path?.startsWith("/assets/") == true) {
                        return false
                    }
                    if (uri.scheme == "https" || uri.scheme == "http") {
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                            .onFailure { Toast.makeText(this@MainActivity, "A hivatkozás nem nyitható meg.", Toast.LENGTH_LONG).show() }
                    }
                    return true
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    view: WebView,
                    callback: ValueCallback<Array<Uri>>,
                    params: FileChooserParams
                ): Boolean {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = callback
                    return runCatching {
                        filePicker.launch(params.createIntent())
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
        val message = runCatching { JSONObject(rawMessage) }.getOrNull() ?: return
        val requestId = message.optString("requestId")
        if (requestId.isBlank()) return
        val args = message.optJSONArray("args") ?: JSONArray()

        when (message.optString("method")) {
            "authorizeGoogleDrive" -> authorizeGoogleDrive(args.optBoolean(0, false), requestId)
            "disconnectGoogleDrive" -> disconnectGoogleDrive(args.optString(0), requestId)
            else -> sendError(requestId, "Ismeretlen E-book Android-művelet.")
        }
    }

    private fun authorizeGoogleDrive(fullRead: Boolean, requestId: String) {
        if (pendingAuthorizationRequestId != null) {
            sendError(requestId, "Már folyamatban van egy Google Drive-engedélykérés.")
            return
        }
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
                pendingAuthorizationRequestId = requestId
                runCatching {
                    authorizationLauncher.launch(IntentSenderRequest.Builder(pendingIntent.intentSender).build())
                }.onFailure {
                    pendingAuthorizationRequestId = null
                    sendError(requestId, googleAuthorizationError(it))
                }
            }
            .addOnFailureListener { sendError(requestId, googleAuthorizationError(it)) }
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

    private fun googleAuthorizationError(error: Throwable): String {
        val statusCode = (error as? ApiException)?.statusCode
        return when (statusCode) {
            10 -> "Google OAuth-konfigurációs hiba (10). Az Android kliens csomagnevét és SHA-1 ujjlenyomatát ellenőrizni kell."
            4 -> "Nincs használható Google-fiók bejelentkezve az eszközön (4)."
            7 -> "A Google-bejelentkezés hálózati hiba miatt nem sikerült (7)."
            15 -> "A Google-bejelentkezés túllépte az időkorlátot (15)."
            16 -> "A Google-bejelentkezés megszakadt (16)."
            null -> error.message ?: "Google Drive-bejelentkezési hiba."
            else -> "Google Drive-bejelentkezési hiba ($statusCode): ${error.message ?: "ismeretlen hiba"}"
        }
    }

    private fun sendResult(requestId: String, payload: String) {
        dispatchResult(JSONObject().apply {
            put("requestId", requestId)
            put("ok", true)
            put("payload", payload)
        })
    }

    private fun sendError(requestId: String, error: String) {
        dispatchResult(JSONObject().apply {
            put("requestId", requestId)
            put("ok", false)
            put("error", error)
        })
    }

    private fun dispatchResult(detail: JSONObject) {
        if (!this::webView.isInitialized) return
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('ebook:android-result',{detail:$detail}))",
                null
            )
        }
    }

    override fun onDestroy() {
        if (this::webView.isInitialized) {
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = null
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}
