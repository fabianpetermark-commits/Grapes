package hu.grapes.healthconnect

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.KeyguardManager
import android.content.Intent
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
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
import android.widget.CheckBox
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
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    private val healthConnect by lazy { HealthConnectBridge(this) }
    private val prodAuth by lazy { ProdAuthCallback(this) }
    private val isProdAuth get() = BuildConfig.APPLICATION_ID == "hu.grapes.healthconnect" && BuildConfig.GRAPES_PROD_AUTH_ENABLED
    private val prodGatePreferences by lazy { getSharedPreferences("grapes-prod-auth-gate-v1", MODE_PRIVATE) }
    private val prodGate by lazy { ProdAuthGate(isProdAuth, prodGatePreferences) }
    private var pendingProdOwnerRequest: Pair<String, String>? = null
    private val yazioApi by lazy { YazioApi(this) }
    private val foodApi by lazy { FoodApiBridge() }
    private val samsungWaterBridge by lazy { SamsungWaterBridgeFactory.create(this) }
    private val googleAuthorization by lazy { Identity.getAuthorizationClient(this) }
    private val updateManager by lazy { AndroidUpdateManager(this) }
    private lateinit var webView: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingCapturedPhoto: Uri? = null
    private var pendingCameraPermission: PermissionRequest? = null
    private var pendingHealthRequest: PendingHealthRequest? = null
    private var pendingDriveRequestId: String? = null
    private var pendingBackupPickerRequestId: String? = null
    private var backupSession: BackupExportSession? = null
    private var availableUpdate: AndroidUpdateManager.Release? = null

    private data class BackupExportSession(
        val token: String,
        val uri: Uri,
        val temporaryFile: File,
        var sizeBytes: Long = 0L,
    )

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val request = pendingCameraPermission
        pendingCameraPermission = null
        if (granted) request?.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else request?.deny()
    }

    private val backupFilePicker = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val requestId = pendingBackupPickerRequestId ?: return@registerForActivityResult
        pendingBackupPickerRequestId = null
        if (uri == null) {
            sendError(requestId, "A biztonsági mentés mentését megszakítottad.")
            return@registerForActivityResult
        }
        runCatching {
            check(backupSession == null) { "Már folyamatban van egy másik mentés." }
            val staging = File.createTempFile("grapes-food-export-", ".json", cacheDir)
            BackupExportSession(UUID.randomUUID().toString(), uri, staging).also { backupSession = it }
        }.onSuccess { sendResult(requestId, it.token) }
            .onFailure { sendError(requestId, it.message ?: "Nem készíthető el a mentés.") }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) checkForAppUpdate(force = true)
    }

    private data class PendingHealthRequest(val from: LocalDate, val requestId: String)

    private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val files = if (result.resultCode == RESULT_OK && pendingCapturedPhoto != null) {
            arrayOf(pendingCapturedPhoto!!)
        } else {
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        }
        fileChooserCallback?.onReceiveValue(files)
        fileChooserCallback = null
        pendingCapturedPhoto = null
    }

    private fun launchWebFileChooser(params: WebChromeClient.FileChooserParams) {
        val cameraOnly = params.isCaptureEnabled &&
            params.acceptTypes.any { it.startsWith("image/") || it == "image/*" }
        if (!cameraOnly) {
            pendingCapturedPhoto = null
            fileChooser.launch(params.createIntent())
            return
        }
        val directory = File(cacheDir, "camera").apply { mkdirs() }
        val photo = File.createTempFile("receipt-", ".jpg", directory)
        val uri = FileProvider.getUriForFile(this, "${applicationContext.packageName}.fileprovider", photo)
        val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
        if (cameraIntent.resolveActivity(packageManager) == null) {
            throw IllegalStateException("Nem található kameralkalmazás a készüléken.")
        }
        pendingCapturedPhoto = uri
        fileChooser.launch(cameraIntent)
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

    // Native device-credential confirmation is required before any legacy
    // local records can be assigned to the first authenticated PROD account.
    private val prodOwnerCredentialLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val pending = pendingProdOwnerRequest ?: return@registerForActivityResult
        pendingProdOwnerRequest = null
        val (requestId, verifiedUserId) = pending
        if (result.resultCode != RESULT_OK || !prodGate.canOfferBinding(isTrustedProdAuthPage(), verifiedUserId)) {
            sendError(requestId, "A készülék és a Grapes-fiók összekapcsolása megszakadt.")
            return@registerForActivityResult
        }
        if (!prodGatePreferences.edit().putString("owner-uid", verifiedUserId).commit()) {
            sendError(requestId, "A Grapes-fiók hozzárendelése nem menthető.")
            return@registerForActivityResult
        }
        if (!prodGate.allowApp(isTrustedProdAuthPage(), verifiedUserId)) {
            prodGate.lock()
            sendError(requestId, "A Grapes-fiókhoz tartozó helyi adatok nem nyithatók meg.")
            return@registerForActivityResult
        }
        completeProdAppEntry(requestId)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureWebView()
        setContentView(webView)
        UpdateNotifications.createChannel(this)
        UpdateCheckWorker.schedule(this)
        val oauthReturn = isProdAuth && prodAuth.accept(intent?.data)
        if (oauthReturn) setIntent(Intent(intent).setData(null))
        if (oauthReturn) prodGate.lock()
        // Preserve byte-for-byte legacy startup behavior when production Auth is disabled.
        if (isProdAuth) webView.loadUrl(prodGate.initialUrl(APP_URL, PROD_AUTH_URL))
        else webView.loadUrl(APP_URL)
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
                    if (isProdAuth && !prodGate.canDisplayApp()) finish()
                    else if (isProdAuth && webView.url == APP_URL) finish()
                    else if (webView.canGoBack()) webView.goBack() else finish()
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (isProdAuth && prodAuth.accept(intent.data)) {
            prodGate.lock()
            setIntent(Intent(intent).setData(null))
            webView.loadUrl(PROD_AUTH_URL)
            return
        }
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
        if (BuildConfig.GRAPES_PROD_AUTH_CANDIDATE) return
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
        val authAssetLoader = WebViewAssetLoader.Builder()
            .setDomain(PROD_AUTH_HOST)
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
                if (isProdAuth) setOf(APP_ORIGIN, PROD_AUTH_ORIGIN) else setOf(APP_ORIGIN)
            ) { _, message, _, isMainFrame, _ ->
                if (!isMainFrame) return@addWebMessageListener
                handleBridgeMessage(message.data ?: return@addWebMessageListener)
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
                    if (isProdAuth && request.url.host == PROD_AUTH_HOST)
                        authAssetLoader.shouldInterceptRequest(request.url)
                    else assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.scheme == "https" && request.url.host == APP_HOST) {
                        if (isProdAuth && !prodGate.canDisplayApp()) {
                            view.loadUrl(PROD_AUTH_URL)
                            return true
                        }
                        return false
                    }
                    if (isProdAuth && request.url.scheme == "https" &&
                        request.url.host == PROD_AUTH_HOST &&
                        request.url.path == "/assets/login-auth-prod.html") return false
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
                        launchWebFileChooser(params)
                        true
                    }.getOrElse {
                        fileChooserCallback = null
                        pendingCapturedPhoto = null
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
        if (isTrustedProdAuthPage() && message.optString("method") !in
            setOf(
                "beginProdAuthOAuth", "takeProdAuthCallback", "cancelProdAuthOAuth",
                "takeProdAuthLaunchMode", "finishProdAuthSignOut", "completeProdAuthLogin"
            )) {
            return sendError(requestId, "Nem engedélyezett PROD Auth-művelet.")
        }
        when (message.optString("method")) {
            "beginProdAuthOAuth" -> beginProdAuthOAuth(message, requestId)
            "takeProdAuthLaunchMode" -> {
                if (!isTrustedProdAuthPage()) sendError(requestId, "A PROD Auth oldal nem aktív.")
                else sendResult(requestId, JSONObject().apply {
                    put("logout", prodGatePreferences.getBoolean("logout-pending", false))
                }.toString())
            }
            "finishProdAuthSignOut" -> {
                if (!isTrustedProdAuthPage()) sendError(requestId, "A PROD Auth oldal nem aktív.")
                else if (!prodGatePreferences.edit().remove("logout-pending").commit())
                    sendError(requestId, "A kijelentkezés állapota nem menthető.")
                else { prodGate.lock(); sendResult(requestId, "{}") }
            }
            "completeProdAuthLogin" -> {
                val userId = message.optJSONArray("args")?.optString(0).orEmpty()
                if (prodGatePreferences.getBoolean("logout-pending", false) || !isTrustedProdAuthPage()) {
                    sendError(requestId, "A Grapes-fiók nincs hitelesítve.")
                } else if (prodGate.allowApp(true, userId)) {
                    completeProdAppEntry(requestId)
                } else if (prodGate.canOfferBinding(true, userId)) {
                    offerProdOwnerBinding(requestId, userId)
                } else {
                    sendError(requestId, "Ezen a készüléken másik Grapes-fiókhoz tartoznak a meglévő adatok.")
                }
            }
            "getProdAuthEnabled" -> sendResult(
                requestId, (isProdAuth && isTrustedProdAppPage()).toString()
            )
            "openProdAuthSignOut" -> {
                if (!prodGate.startLogout(isTrustedProdAppPage())) {
                    sendError(requestId, "A Grapes PROD-fiók nem aktív.")
                } else if (!prodGatePreferences.edit().putBoolean("logout-pending", true).commit()) {
                    sendError(requestId, "A kijelentkezés nem készíthető elő.")
                } else {
                    webView.loadUrl(PROD_AUTH_URL)
                }
            }
            "takeProdAuthCallback" -> {
                if (!isTrustedProdAuthPage()) sendError(requestId, "A PROD Auth oldal nem aktív.")
                else sendResult(requestId, prodAuth.consume().toString())
            }
            "cancelProdAuthOAuth" -> {
                if (!isTrustedProdAuthPage()) sendError(requestId, "A PROD Auth oldal nem aktív.")
                else { prodAuth.cancel(); sendResult(requestId, "{}") }
            }
            "beginFoodBackupExport" -> beginFoodBackupExport(message, requestId)
            "appendFoodBackupExport" -> appendFoodBackupExport(message, requestId)
            "finishFoodBackupExport" -> finishFoodBackupExport(message, requestId)
            "cancelFoodBackupExport" -> cancelFoodBackupExport(message, requestId)
            "foodApi" -> lifecycleScope.launch {
                runCatching { foodApi.execute(message.optJSONArray("args") ?: JSONArray()) }
                    .onSuccess { sendResult(requestId, it.toString()) }
                    .onFailure { sendError(requestId, it.message ?: "Az élelmiszer-keresés sikertelen.") }
            }
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

    private fun isTrustedProdAuthPage(): Boolean = isProdAuth && webView.url == PROD_AUTH_URL

    private fun isTrustedProdAppPage(): Boolean = isProdAuth && webView.url == APP_URL

    /**
     * Binding is a deliberate, one-time account ownership decision. Empty
     * installs require no data export; existing records must not be silently
     * migrated across accounts. Physical device confirmation is required.
     */
    private fun offerProdOwnerBinding(requestId: String, userId: String) {
        if (!prodGate.canOfferBinding(isTrustedProdAuthPage(), userId)) {
            return sendError(requestId, "Ehhez a készülékhez nem rendelhető új Grapes-fiók.")
        }
        if (pendingProdOwnerRequest != null) {
            return sendError(requestId, "Egy másik fiókhozzárendelés már folyamatban van.")
        }
        val keyguard = getSystemService(KEYGUARD_SERVICE) as? KeyguardManager
        if (keyguard?.isDeviceSecure != true) {
            return sendError(requestId, "Az első fiókhozzárendelés előtt állíts be PIN-kódot vagy képernyőzárat.")
        }
        pendingProdOwnerRequest = requestId to userId
        val acknowledgement = CheckBox(this).apply {
            text = "A Grapes alkalmazásban nincs megőrzendő korábbi adatom, vagy a meglévő adataim ehhez a fiókhoz tartoznak."
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle("Grapes-fiók és helyi adatok")
            .setMessage(
                "Ha a Grapes alkalmazás üres, nincs szükség biztonsági mentésre. " +
                "Ezt a készüléket egyetlen Grapes-fiókhoz kapcsolhatod. " +
                "Ha vannak korábbi helyi adatok, azok ehhez a fiókhoz " +
                "tartoznak; másik fiók nem láthatja őket. " +
                "A folytatáshoz erősítsd meg a készülék képernyőzárát."
            )
            .setView(acknowledgement)
            .setPositiveButton("Összekapcsolás", null)
            .setNegativeButton("Mégsem") { _, _ ->
                pendingProdOwnerRequest = null
                sendError(requestId, "A fiók és a helyi adatok összekapcsolását megszakítottad.")
            }
            .create()
        dialog.setOnCancelListener {
            pendingProdOwnerRequest = null
            sendError(requestId, "A fiók és a helyi adatok összekapcsolását megszakítottad.")
        }
        dialog.setOnShowListener {
            val positive = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            positive.isEnabled = false
            acknowledgement.setOnCheckedChangeListener { _, checked ->
                positive.isEnabled = checked
            }
            positive.setOnClickListener {
                if (!acknowledgement.isChecked || pendingProdOwnerRequest != (requestId to userId)) {
                    return@setOnClickListener
                }
                @Suppress("DEPRECATION")
                val credentialIntent = keyguard.createConfirmDeviceCredentialIntent(
                    "Grapes-fiók hozzárendelése",
                    "Igazold, hogy ez a te készüléked."
                )
                if (credentialIntent == null) {
                    pendingProdOwnerRequest = null
                    dialog.dismiss()
                    sendError(requestId, "Nem indítható a készülék biztonsági azonosítása.")
                    return@setOnClickListener
                }
                dialog.dismiss()
                runCatching { prodOwnerCredentialLauncher.launch(credentialIntent) }
                    .onFailure {
                        pendingProdOwnerRequest = null
                        sendError(requestId, "Nem indítható a készülék biztonsági azonosítása.")
                    }
            }
        }
        dialog.show()
    }

    private fun completeProdAppEntry(requestId: String) {
        // The bridge event must arrive before the WebView navigates away.
        val detail = JSONObject().apply {
            put("requestId", requestId)
            put("ok", true)
            put("payload", "{}")
        }
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('grapes:android-result',{detail:${detail}}))"
        ) { if (prodGate.canDisplayApp() && isTrustedProdAuthPage()) webView.loadUrl(APP_URL) }
    }

    private fun beginProdAuthOAuth(message: JSONObject, requestId: String) {
        if (!isTrustedProdAuthPage()) return sendError(requestId, "A PROD Auth oldal nem aktív.")
        val args = message.optJSONArray("args") ?: return sendError(requestId, "Érvénytelen Auth-kérés.")
        val authorizeUrl = args.optString(0)
        val state = args.optString(1)
        if (!prodAuth.begin(authorizeUrl, state)) return sendError(requestId, "Érvénytelen PROD OAuth-cím.")
        runCatching {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(authorizeUrl)).addCategory(Intent.CATEGORY_BROWSABLE))
        }.onSuccess { sendResult(requestId, "{}") }
            .onFailure {
                prodAuth.cancel()
                sendError(requestId, "A rendszerböngésző nem nyitható meg.")
            }
    }

    private fun beginFoodBackupExport(message: JSONObject, requestId: String) {
        if (pendingBackupPickerRequestId != null || backupSession != null) {
            sendError(requestId, "Egy másik biztonsági mentés már folyamatban van.")
            return
        }
        val name = message.optJSONArray("args")?.optString(0).orEmpty()
        if (!Regex("^grapes-(?:etelnaplo-\\d{4}-\\d{2}-\\d{2}(?:-(?:helyi|drive))?|viznaplo-\\d{4}-\\d{2}-\\d{2})\\.json$").matches(name)) {
            sendError(requestId, "Érvénytelen biztonsági mentés fájlnév.")
            return
        }
        pendingBackupPickerRequestId = requestId
        runCatching { backupFilePicker.launch(name) }.onFailure {
            pendingBackupPickerRequestId = null
            sendError(requestId, it.message ?: "A fájlmentő nem nyitható meg.")
        }
    }

    private fun appendFoodBackupExport(message: JSONObject, requestId: String) {
        val args = message.optJSONArray("args")
        val session = backupSession
        if (session == null || session.token != args?.optString(0)) {
            sendError(requestId, "A biztonsági mentés művelete nem érvényes.")
            return
        }
        runCatching {
            val piece = args.optString(1)
            require(piece.isNotEmpty()) { "Üres mentési adatrész." }
            val encoded = piece.toByteArray(Charsets.UTF_8)
            require(session.sizeBytes + encoded.size <= MAX_BACKUP_BYTES) {
                "A biztonsági mentés túl nagy a biztonságos fájlexporthoz."
            }
            session.temporaryFile.appendBytes(encoded)
            session.sizeBytes += encoded.size
        }.onSuccess { sendResult(requestId, "{}") }
            .onFailure {
                session.temporaryFile.delete()
                backupSession = null
                sendError(requestId, it.message ?: "Nem sikerült az adatok átadása.")
            }
    }

    private fun finishFoodBackupExport(message: JSONObject, requestId: String) {
        val args = message.optJSONArray("args")
        val session = backupSession
        if (session == null || session.token != args?.optString(0)) {
            sendError(requestId, "A biztonsági mentés művelete nem érvényes.")
            return
        }
        backupSession = null
        val expectedBytes = args.optLong(1, -1)
        lifecycleScope.launch {
            val result = runCatching {
                withContext(Dispatchers.IO) {
                    check(session.sizeBytes > 0 && session.sizeBytes == expectedBytes) {
                        "A biztonsági mentés mérete eltér, a fájl nem menthető biztonságosan."
                    }
                    contentResolver.openOutputStream(session.uri, "wt")?.use { out ->
                        session.temporaryFile.inputStream().use { input ->
                            input.copyTo(out)
                        }
                    } ?: error("A kiválasztott helyre nem írható a fájl.")
                }
            }
            session.temporaryFile.delete()
            result.onSuccess { sendResult(requestId, "{}") }
                .onFailure { sendError(requestId, it.message ?: "A fájlmentés nem sikerült.") }
        }
    }

    private fun cancelFoodBackupExport(message: JSONObject, requestId: String) {
        val session = backupSession
        if (session != null && session.token == message.optJSONArray("args")?.optString(0)) {
            session.temporaryFile.delete()
            backupSession = null
        }
        sendResult(requestId, "{}")
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
        pendingProdOwnerRequest = null
        backupSession?.temporaryFile?.delete()
        backupSession = null
        fileChooserCallback?.onReceiveValue(null)
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val MAX_BACKUP_BYTES = 80L * 1024L * 1024L
        private const val APP_HOST = "appassets.androidplatform.net"
        private const val APP_ORIGIN = "https://$APP_HOST"
        private const val APP_URL = "https://$APP_HOST/assets/design/android-mobile-preview.html"
        private const val PROD_AUTH_HOST = "grapes-prod-auth.invalid"
        private const val PROD_AUTH_ORIGIN = "https://$PROD_AUTH_HOST"
        private const val PROD_AUTH_URL = "$PROD_AUTH_ORIGIN/assets/login-auth-prod.html"
        private const val DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
        private const val DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
        private const val NOTIFICATION_PREFERENCES = "grapes-notifications"
        private const val NOTIFICATION_PERMISSION_EXPLAINED = "update-permission-explained"
    }
}

