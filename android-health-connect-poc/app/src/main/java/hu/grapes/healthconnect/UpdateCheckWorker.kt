package hu.grapes.healthconnect

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class UpdateCheckWorker(
    appContext: Context,
    parameters: WorkerParameters
) : CoroutineWorker(appContext, parameters) {
    override suspend fun doWork(): Result = try {
        AndroidUpdateManager(applicationContext).findAvailableRelease()
            ?.let { UpdateNotifications.showAvailable(applicationContext, it) }
        Result.success()
    } catch (_: Exception) {
        Result.retry()
    }

    companion object {
        private const val UNIQUE_WORK = "grapes-periodic-update-check"

        fun schedule(context: Context) {
            if (BuildConfig.GRAPES_PROD_AUTH_CANDIDATE) {
                WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK)
                UpdateNotifications.clear(context)
                return
            }
            val request = PeriodicWorkRequestBuilder<UpdateCheckWorker>(6, TimeUnit.HOURS).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_WORK,
                ExistingPeriodicWorkPolicy.UPDATE,
                request
            )
        }
    }
}
