package hu.grapes.healthconnect

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object UpdateNotifications {
    const val EXTRA_OPEN_UPDATE = "hu.grapes.healthconnect.OPEN_UPDATE"
    private const val CHANNEL_ID = "grapes_app_updates"
    private const val NOTIFICATION_ID = 5001

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Alkalmazásfrissítések",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Értesítés, amikor a Grapes új verziója letölthető."
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    fun showAvailable(context: Context, release: AndroidUpdateManager.Release): Boolean {
        createChannel(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false

        val openApp = Intent(context, MainActivity::class.java).apply {
            putExtra(EXTRA_OPEN_UPDATE, true)
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Grapes frissítés érhető el")
            .setContentText("${release.versionName} letölthető. Koppints a frissítéshez.")
            .setStyle(NotificationCompat.BigTextStyle().bigText(
                buildString {
                    append("${release.versionName} letölthető.")
                    val notes = release.notes.trim().take(320)
                    if (notes.isNotBlank()) append("\n\n$notes")
                }
            ))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        return true
    }
}
