package hu.grapes.healthconnect

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.ScaleGestureDetector
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.common.InputImage

/**
 * TEST-only native Food scanner. No images leave the device; only a validated
 * barcode is returned to Grapes, where the existing OFF lookup is unchanged.
 */
class NativeBarcodeScannerActivity : ComponentActivity() {
    companion object {
        const val EXTRA_CODE = "grapes.barcode.value"
        const val EXTRA_ERROR = "grapes.barcode.error"
        private val CYAN = Color.rgb(67, 218, 227)
        private val BG = Color.rgb(12, 19, 24)
    }

    private var provider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var torchOn = false
    private var accepted = false
    private var lastCandidate = ""
    private var repeatCount = 0
    private lateinit var previewView: PreviewView
    private lateinit var status: TextView
    private lateinit var torch: ImageView
    private lateinit var manualCode: EditText

    // Bundled ML Kit model: first scan works without a model download.
    private val scanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8,
                Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E
            ).build()
    )
    private val cameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { allowed ->
        if (allowed) startCamera()
        else status.text = "Nincs kameraengedély. A kódot alul kézzel is beírhatod."
    }

    private val zoomGesture by lazy {
        ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val current = camera ?: return false
                val zoom = current.cameraInfo.zoomState.value ?: return false
                val desired = (zoom.zoomRatio * detector.scaleFactor)
                    .coerceIn(zoom.minZoomRatio, zoom.maxZoomRatio)
                current.cameraControl.setZoomRatio(desired)
                return true
            }
        })
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = BG
        window.navigationBarColor = BG
        buildUi()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED) startCamera()
        else cameraPermission.launch(Manifest.permission.CAMERA)
    }

    private fun dp(n: Int) = (n * resources.displayMetrics.density + 0.5f).toInt()

    private fun rounded(color: Int, radius: Int = 14): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(radius).toFloat()
        }

    private fun text(label: String, size: Float, color: Int, bold: Boolean = false) =
        TextView(this).apply {
            this.text = label
            textSize = size
            setTextColor(color)
            gravity = Gravity.CENTER
            if (bold) setTypeface(null, Typeface.BOLD)
        }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(BG)
            setPadding(dp(16), dp(12), dp(16), dp(18))
        }
        setContentView(root)

        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        root.addView(toolbar, LinearLayout.LayoutParams(-1, dp(58)))

        val close = text("‹", 34f, Color.rgb(206, 218, 223)).apply {
            contentDescription = "Vissza"
            setOnClickListener { finish() }
        }
        toolbar.addView(close, LinearLayout.LayoutParams(dp(44), -1))
        val title = text("Vonalkódolvasó", 19f, Color.WHITE, true).apply {
            gravity = Gravity.CENTER_VERTICAL
        }
        toolbar.addView(title, LinearLayout.LayoutParams(0, -1, 1f))

        root.addView(text("Irányítsd a kamerát a vonalkódra", 16f, Color.WHITE, true),
            LinearLayout.LayoutParams(-1, dp(38)))
        root.addView(text("A felismerés automatikus", 13f, Color.rgb(152, 173, 181)),
            LinearLayout.LayoutParams(-1, dp(30)))

        val frame = FrameLayout(this).apply {
            background = rounded(Color.rgb(29, 42, 49), 17)
            clipToOutline = true
        }
        val frameParams = LinearLayout.LayoutParams(-1, 0, 1f).apply {
            topMargin = dp(14)
            bottomMargin = dp(15)
        }
        root.addView(frame, frameParams)
        previewView = PreviewView(this).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        frame.addView(previewView, FrameLayout.LayoutParams(-1, -1))
        frame.addView(ScannerReticle(this), FrameLayout.LayoutParams(-1, -1))
        // Floating flashlight at the camera viewfinder, not the page title.
        torch = ImageView(this).apply {
            setImageResource(R.drawable.ic_grapes_flashlight)
            scaleType = ImageView.ScaleType.FIT_CENTER
            setPadding(dp(12), dp(12), dp(12), dp(12))
            background = torchBackground(false)
            contentDescription = "Vaku bekapcsolása"
            isClickable = true
            isFocusable = true
            setOnClickListener { toggleTorch() }
        }
        frame.addView(torch, FrameLayout.LayoutParams(dp(52), dp(52),
            Gravity.END or Gravity.BOTTOM).apply {
            rightMargin = dp(20)
            bottomMargin = dp(22)
        })
        previewView.setOnTouchListener { _, event -> zoomGesture.onTouchEvent(event); true }

        status = text("Kamera indítása…", 14f, Color.rgb(169, 211, 217))
        root.addView(status, LinearLayout.LayoutParams(-1, dp(54)))

        val manual = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        root.addView(manual, LinearLayout.LayoutParams(-1, dp(54)))
        manualCode = EditText(this).apply {
            hint = "Vonalkód kézzel"
            setHintTextColor(Color.rgb(134, 158, 168))
            setTextColor(Color.WHITE)
            textSize = 15f
            setSingleLine(true)
            inputType = InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(InputFilter.LengthFilter(14))
            setPadding(dp(12), 0, dp(10), 0)
            background = rounded(Color.rgb(31, 45, 52), 10)
        }
        manual.addView(manualCode, LinearLayout.LayoutParams(0, dp(48), 1f))
        val submit = text("Keresés", 14f, BG, true).apply {
            background = rounded(CYAN, 10)
            setOnClickListener {
                val code = normalize(manualCode.text.toString(), null)
                if (code == null) status.text = "Érvénytelen EAN/UPC vonalkód."
                else returnBarcode(code)
            }
        }
        manual.addView(submit, LinearLayout.LayoutParams(dp(92), dp(48)).apply {
            leftMargin = dp(8)
        })
        root.addView(text("A kamera csak a vonalkódot olvassa · a képet nem mentjük", 11f,
            Color.rgb(127, 150, 159)), LinearLayout.LayoutParams(-1, dp(38)))
    }

    private fun torchBackground(on: Boolean): GradientDrawable =
        GradientDrawable().apply {
            setColor(if (on) Color.rgb(26, 74, 80) else Color.rgb(18, 38, 46))
            cornerRadius = dp(16).toFloat()
            setStroke(dp(if (on) 2 else 1), CYAN)
        }

    private fun toggleTorch() {
        val current = camera ?: return
        if (!current.cameraInfo.hasFlashUnit()) {
            status.text = "Ezen a kamerán nincs elérhető vaku."
            return
        }
        val desired = !torchOn
        current.cameraControl.enableTorch(desired).addListener({
            torchOn = current.cameraInfo.torchState.value ==
                androidx.camera.core.TorchState.ON
            torch.background = torchBackground(torchOn)
            torch.contentDescription = if (torchOn) "Vaku kikapcsolása" else "Vaku bekapcsolása"
        }, ContextCompat.getMainExecutor(this))
    }

    @OptIn(androidx.camera.core.ExperimentalGetImage::class)
    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            if (isFinishing || isDestroyed) return@addListener
            try {
                val activeProvider = future.get()
                provider = activeProvider
                val preview = Preview.Builder().build().apply {
                    setSurfaceProvider(previewView.surfaceProvider)
                }
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis.setAnalyzer(ContextCompat.getMainExecutor(this)) { proxy ->
                    val image = proxy.image
                    if (image == null || accepted) {
                        proxy.close()
                    } else {
                        val input = InputImage.fromMediaImage(image,
                            proxy.imageInfo.rotationDegrees)
                        scanner.process(input)
                            .addOnSuccessListener { found ->
                                if (!accepted) handleCandidates(found)
                            }
                            .addOnCompleteListener { proxy.close() }
                    }
                }
                activeProvider.unbindAll()
                camera = activeProvider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA,
                    preview, analysis)
                torch.alpha = if (camera?.cameraInfo?.hasFlashUnit() == true) 1f else 0.35f
                status.text = "Vonalkód keresése… · két egyező felismerés szükséges"
            } catch (error: Exception) {
                status.text = "A kamera nem indult el. A kódot kézzel is beírhatod."
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun handleCandidates(codes: List<Barcode>) {
        val candidate = codes.asSequence().mapNotNull {
            normalize(it.rawValue.orEmpty(), it.format)
        }.firstOrNull()
        if (candidate == null) {
            repeatCount = 0
            lastCandidate = ""
            return
        }
        if (candidate == lastCandidate) repeatCount++ else {
            lastCandidate = candidate
            repeatCount = 1
        }
        if (repeatCount >= 2) returnBarcode(candidate)
    }

    private fun returnBarcode(code: String) {
        if (accepted) return
        accepted = true
        camera?.cameraControl?.enableTorch(false)
        setResult(RESULT_OK, Intent().putExtra(EXTRA_CODE, code))
        finish()
    }

    /**
     * Validate check digits, and expand UPC-E to UPC-A for catalog lookup.
     * Never strip leading zeroes or accept arbitrary numeric text.
     */
    private fun normalize(raw: String, format: Int?): String? {
        if (!raw.matches(Regex("[0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14}")))
            return null
        val expanded = if (format == Barcode.FORMAT_UPC_E || 
            (raw.length == 8 && (raw[0] == '0' || raw[0] == '1') && !validCheck(raw)))
            expandUpce(raw) ?: return null
        else raw
        return expanded.takeIf { validCheck(it) }
    }

    private fun validCheck(code: String): Boolean {
        if (code.length !in listOf(8, 12, 13, 14)) return false
        var sum = 0
        for (i in code.length - 2 downTo 0) {
            val factor = if ((code.length - 1 - i) % 2 == 1) 3 else 1
            sum += (code[i] - '0') * factor
        }
        return (10 - sum % 10) % 10 == (code.last() - '0')
    }

    private fun expandUpce(code: String): String? {
        if (code.length != 8 || code[0] !in "01") return null
        val d = code.substring(1, 7)
        val maker: String
        val product: String
        when (d[5]) {
            '0', '1', '2' -> {
                maker = d.substring(0, 2) + d[5] + "00"
                product = "00" + d.substring(2, 5)
            }
            '3' -> {
                maker = d.substring(0, 3) + "00"
                product = "000" + d.substring(3, 5)
            }
            '4' -> {
                maker = d.substring(0, 4) + "0"
                product = "0000" + d[4]
            }
            else -> {
                maker = d.substring(0, 5)
                product = "0000" + d[5]
            }
        }
        return code[0].toString() + maker + product + code[7]
    }

    override fun onStop() {
        camera?.cameraControl?.enableTorch(false)
        torchOn = false
        super.onStop()
    }

    override fun onDestroy() {
        provider?.unbindAll()
        scanner.close()
        super.onDestroy()
    }

    private class ScannerReticle(context: android.content.Context) : View(context) {
        private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CYAN
            style = Paint.Style.STROKE
            strokeWidth = 4f * resources.displayMetrics.density
            strokeCap = Paint.Cap.ROUND
        }
        private val beam = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = CYAN
            alpha = 170
            strokeWidth = 2f * resources.displayMetrics.density
        }
        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val d = resources.displayMetrics.density
            val margin = 22f * d
            val frame = RectF(margin, height * 0.25f,
                width - margin, height * 0.75f)
            val len = 36f * d
            val path = Path().apply {
                moveTo(frame.left, frame.top + len)
                lineTo(frame.left, frame.top + 14f * d)
                quadTo(frame.left, frame.top, frame.left + 14f * d, frame.top)
                lineTo(frame.left + len, frame.top)
                moveTo(frame.right - len, frame.top)
                lineTo(frame.right - 14f * d, frame.top)
                quadTo(frame.right, frame.top, frame.right, frame.top + 14f * d)
                lineTo(frame.right, frame.top + len)
                moveTo(frame.right, frame.bottom - len)
                lineTo(frame.right, frame.bottom - 14f * d)
                quadTo(frame.right, frame.bottom, frame.right - 14f * d, frame.bottom)
                lineTo(frame.right - len, frame.bottom)
                moveTo(frame.left + len, frame.bottom)
                lineTo(frame.left + 14f * d, frame.bottom)
                quadTo(frame.left, frame.bottom, frame.left, frame.bottom - 14f * d)
                lineTo(frame.left, frame.bottom - len)
            }
            canvas.drawPath(path, border)
            canvas.drawLine(frame.left + 8f * d, frame.centerY(),
                frame.right - 8f * d, frame.centerY(), beam)
        }
    }
}
