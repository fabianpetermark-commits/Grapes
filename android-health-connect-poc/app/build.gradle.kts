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
    }
    defaultConfig {
        applicationId = "hu.grapes.healthconnect"
        minSdk = 29
        targetSdk = 35
        versionCode = grapesVersionCode
        versionName = grapesVersionName
        // Explicit production opt-in; defaults OFF on every ordinary release.
        buildConfigField("boolean", "GRAPES_PROD_AUTH_ENABLED", "false")
    }
    buildTypes {
        getByName("release") {
            if (!releaseKeystorePath.isNullOrBlank()) signingConfig = signingConfigs.getByName("release")
            val approvedProdAuth = providers.environmentVariable("VITE_GRAPES_PROD_AUTH_ENABLED").orNull == "true" &&
                providers.environmentVariable("VITE_GRAPES_PROD_LEGACY_DATA_ISOLATION_REVIEWED").orNull == "true" &&
                providers.environmentVariable("VITE_GRAPES_PROD_SUPABASE_URL").orNull == "https://yopabovoxyffhokhbgxl.supabase.co" &&
                providers.environmentVariable("VITE_GRAPES_PROD_SUPABASE_PUBLISHABLE_KEY").orNull
                    ?.matches(Regex("sb_publishable_[A-Za-z0-9_-]{16,}")) == true
            buildConfigField("boolean", "GRAPES_PROD_AUTH_ENABLED", approvedProdAuth.toString())
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
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("com.google.android.gms:play-services-auth:21.5.0")
    implementation("com.google.code.gson:gson:2.13.2")
    if (samsungSdk.exists()) {
        implementation(files(samsungSdk))
    }
}
