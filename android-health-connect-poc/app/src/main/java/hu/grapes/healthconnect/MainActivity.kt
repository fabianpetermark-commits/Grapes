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
import androidx.activity.result.contract.ActivityResultContracts
import androidx.health.connect.client.HealthConnectClient
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    private val healthConnect by lazy { HealthConnectBridge(this) }
    private lateinit var webView: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingHealthRequest: PendingHealthRequest? = null

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
                handleBridgeMessage(message.data)
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
            else -> sendError(requestId, "Ismeretlen Android-művelet.")
        }
    }

    private fun readHealthData(
        from: LocalDate,
        requestId: String,
        allowPermissionRequest: Boolean = true
    ) = lifecycleScope.launch {
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
    }
}
