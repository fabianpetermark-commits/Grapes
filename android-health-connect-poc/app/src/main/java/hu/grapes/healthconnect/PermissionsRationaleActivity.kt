package hu.grapes.healthconnect

import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity

class PermissionsRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(48, 72, 48, 48)
            addView(TextView(context).apply { text = "Miért kér hozzáférést a Grapes?"; textSize = 24f })
            addView(TextView(context).apply {
                text = "A Grapes csak az engedélyezett táplálkozási és folyadékadatokat olvassa. A POC kézzel indított, helyi JSON exportot készít, nem küld adatot szerverre. A hozzáférés bármikor visszavonható."
                textSize = 16f; setPadding(0, 24, 0, 0)
            })
        })
    }
}
