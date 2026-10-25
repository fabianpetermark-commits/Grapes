plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.parcelize")
}

val samsungSdk = file("libs/samsung-health-data-api-1.1.0.aar")
val releaseKeystorePath = providers.environmentVariable("ANDROID_KEYSTORE_PATH").orNull
val releaseStorePassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("ANDROID_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("ANDROID_KEY_PASSWORD").orNull
// A separate TEST signing identity can be injected for persistent QA releases.
val testKeystorePath = providers.environmentVariable("ANDROID_TEST_KEYSTORE_PATH").orNull
val testStorePassword = providers.environmentVariable("ANDROID_TEST_KEYSTORE_PASSWORD").orNull
val testKeyAlias = providers.environmentVariable("ANDROID_TEST_KEY_ALIAS").orNull
val testKeyPassword = providers.environmentVariable("ANDROID_TEST_KEY_PASSWORD").orNull
val grapesVersionCode = providers.environmentVariable("GRAPES_VERSION_CODE").orNull?.toIntOrNull() ?: 1
val grapesVersionName = providers.environmentVariable("GRAPES_VERSION_NAME").orNull ?: "0.1.0-poc"

android {
    namespace = "hu.grapes.healthconnect"
    compileSdk = 36
    signingConfigs {
        if (!releaseKeystorePath.isNullOrBlank()) {
            create("release") {
                storeFile = file(releaseKeystorePath)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                storeType = "PKCS12"
            }
        }
        if (!testKeystorePath.isNullOrBlank()) {
            create("qa") {
                storeFile = file(testKeystorePath)
                storePassword = testStorePassword
                keyAlias = testKeyAlias
                keyPassword = testKeyPassword
                storeType = "PKCS12"
            }
        }
    }
    defaultConfig {
        applicationId = "hu.grapes.healthconnect"
        minSdk = 29
        targetSdk = 35
        versionCode = grapesVersionCode
        versionName = grapesVersionName
        buildConfigField("boolean", "GRAPES_TEST_AUTH_ENABLED", "false")
        buildConfigField("boolean", "GRAPES_TEST_DATA_ENABLED", "false")
        buildConfigField("boolean", "GRAPES_TEST_LEGACY_BACKUP_ENABLED", "false")
        buildConfigField("String", "GRAPES_TEST_PUBLISHABLE_KEY", "\"\"")
    }
    buildTypes {
        getByName("debug") {
            // Install development builds alongside the stable Grapes app.
            // The separate application ID also isolates Android app data.
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
        }
        getByName("release") {
            if (!releaseKeystorePath.isNullOrBlank()) signingConfig = signingConfigs.getByName("release")
        }
        // The debug .dev variant and stable release variant remain unchanged.
        create("qa") {
            initWith(getByName("release"))
            applicationIdSuffix = ".test"
            versionNameSuffix = "-test"
            val authEnabled = providers.environmentVariable("VITE_GRAPES_TEST_AUTH_ENABLED").orNull == "true" &&
                providers.environmentVariable("VITE_GRAPES_TEST_SUPABASE_URL").orNull == "https://aighqtqjlzirlokxwupt.supabase.co" &&
                providers.environmentVariable("VITE_GRAPES_TEST_SUPABASE_PUBLISHABLE_KEY").orNull
                    ?.matches(Regex("sb_publishable_[A-Za-z0-9_-]{16,}")) == true
            buildConfigField("boolean", "GRAPES_TEST_AUTH_ENABLED", authEnabled.toString())
            val dataEnabled = authEnabled && providers.environmentVariable("VITE_GRAPES_TEST_DATA_ENABLED").orNull == "true"
            buildConfigField("boolean", "GRAPES_TEST_DATA_ENABLED", dataEnabled.toString())
            // Deliberately OFF unless a dedicated signed TEST backup QA build
            // explicitly opts in. Never available in PROD/release/debug.
            val legacyBackupEnabled = authEnabled &&
                providers.environmentVariable("VITE_GRAPES_TEST_LEGACY_BACKUP_ENABLED").orNull == "true"
            buildConfigField("boolean", "GRAPES_TEST_LEGACY_BACKUP_ENABLED", legacyBackupEnabled.toString())
            val publicKey = if (dataEnabled)
                providers.environmentVariable("VITE_GRAPES_TEST_SUPABASE_PUBLISHABLE_KEY").get() else ""
            buildConfigField("String", "GRAPES_TEST_PUBLISHABLE_KEY", "\"$publicKey\"")
            signingConfig = if (!testKeystorePath.isNullOrBlank()) {
                signingConfigs.getByName("qa")
            } else {
                // Preview signing only; keys may differ between GitHub runners.
                signingConfigs.getByName("debug")
            }
        }
    }
    buildFeatures { buildConfig = true }
    sourceSets["main"].java.srcDir(
        if (samsungSdk.exists()) "src/samsung/java" else "src/samsungStub/java"
    )
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    testOptions { unitTests.isIncludeAndroidResources = true }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")
    // Native Food scanner uses the bundled offline ML Kit model.
    implementation("androidx.camera:camera-camera2:1.6.2")
    implementation("androidx.camera:camera-lifecycle:1.6.2")
    implementation("androidx.camera:camera-view:1.6.2")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("com.google.android.gms:play-services-auth:21.5.0")
    implementation("com.google.code.gson:gson:2.13.2")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    if (samsungSdk.exists()) {
        implementation(files(samsungSdk))
    }
}
