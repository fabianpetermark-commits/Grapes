package hu.grapes.healthconnect

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.health.connect.client.HealthConnectClient
import kotlinx.coroutines.launch
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    private val bridge by lazy { HealthConnectBridge(this) }
    private val samsungWater by lazy { SamsungWaterBridgeFactory.create(this) }
    private lateinit var output: TextView
    private var lastExport: String? = null
    private val permissionLauncher = registerForActivityResult(HealthConnectBridge.permissionContract) {
        show("Megadott Health Connect jogosultságok: ${it.size}")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); setContentView(buildUi()); showAvailability()
    }

    private fun buildUi() = ScrollView(this).apply {
        addView(LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; setPadding(40, 56, 40, 56)
            addView(TextView(context).apply {
                text = "Grapes × Health Connect"; textSize = 26f
                setTextColor(Color.rgb(45, 35, 72))
            })
            addView(TextView(context).apply {
                text = "POC: táplálkozás és víz olvasása, próbaétkezés írása, JSON export."
                textSize = 16f; setPadding(0, 12, 0, 28)
            })
            button("1. Jogosultságok megadása") { requestPermissions() }
            button("2. Adatok beolvasása 2026-01-01-től") { readData() }
            button("3. Idempotens próbaétkezés írása") { writeTest() }
            button("4. JSON másolása") { copyExport() }
            button("Samsung-víz jogosultság") { requestSamsungWaterPermission() }
            button("Samsung-víz beolvasása") { readSamsungWater() }
            button("Próbaétkezés törlése") { deleteTest() }
            button("Health Connect beállítások") { openSettings() }
            output = TextView(context).apply {
                textSize = 13f; setTextIsSelectable(true); setPadding(0, 28, 0, 0)
            }
            addView(output)
        })
    }

    private fun LinearLayout.button(label: String, action: () -> Unit) =
        addView(Button(context).apply { text = label; setOnClickListener { action() } },
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

    private fun showAvailability() = show((when (bridge.sdkStatus()) {
        HealthConnectClient.SDK_AVAILABLE -> "Health Connect elérhető."
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "Telepítés vagy frissítés szükséges."
        else -> "A Health Connect nem érhető el ezen a készüléken."
    }) + "\n" + samsungWater.availabilityMessage)

    private fun requestPermissions() = lifecycleScope.launch {
        runCatching { bridge.requestedPermissions() }
            .onSuccess(permissionLauncher::launch).onFailure(::showError)
    }
    private fun readData() = lifecycleScope.launch {
        runCatching {
            val missing = bridge.requestedPermissions() - bridge.grantedPermissions()
            check(missing.isEmpty()) { "Hiányzó jogosultságok: ${missing.joinToString()}" }
            bridge.readExport(LocalDate.of(2026, 1, 1)).toJson()
        }.onSuccess { lastExport = it; show(it) }.onFailure(::showError)
    }
    private fun writeTest() = lifecycleScope.launch {
        runCatching { bridge.writeTestNutrition() }
            .onSuccess { show("Próbaétkezés elmentve. Rekord: $it") }.onFailure(::showError)
    }
    private fun requestSamsungWaterPermission() = lifecycleScope.launch {
        runCatching {
            check(samsungWater.available) { samsungWater.availabilityMessage }
            samsungWater.requestReadPermission(this@MainActivity)
        }.onSuccess { granted ->
            show(if (granted) "Samsung-víz olvasása engedélyezve."
            else "A Samsung-víz jogosultság nincs megadva vagy a platform nem áll készen.")
        }.onFailure(::showError)
    }
    private fun readSamsungWater() = lifecycleScope.launch {
        runCatching {
            check(samsungWater.available) { samsungWater.availabilityMessage }
            BridgeExport(
                generatedAt = java.time.Instant.now().toString(),
                records = samsungWater.readWater(LocalDate.of(2026, 1, 1))
            ).toJson()
        }.onSuccess { lastExport = it; show(it) }.onFailure(::showError)
    }
    private fun deleteTest() = lifecycleScope.launch {
        runCatching { bridge.deleteTestNutrition() }
            .onSuccess { show("A Grapes próbaétkezése törölve.") }.onFailure(::showError)
    }
    private fun copyExport() {
        val json = lastExport ?: return show("Előbb olvasd be az adatokat.")
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Grapes Health Connect export", json))
        show("A JSON export a vágólapra került (${json.length} karakter).")
    }
    private fun openSettings() {
        runCatching { startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)) }
            .onFailure { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            }) }
    }
    private fun showError(error: Throwable) = show("Hiba: ${error.message ?: error.javaClass.simpleName}")
    private fun show(message: String) { output.text = message }
}
