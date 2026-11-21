plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val ebookVersionCode = providers.environmentVariable("EBOOK_ANDROID_VERSION_CODE").orNull?.toIntOrNull() ?: 1
val ebookVersionName = providers.environmentVariable("EBOOK_ANDROID_VERSION_NAME").orNull ?: "0.1.0"

android {
    namespace = "hu.grapes.ebook"
    compileSdk = 36

    defaultConfig {
        applicationId = "hu.grapes.ebook"
        minSdk = 26
        targetSdk = 35
        versionCode = ebookVersionCode
        versionName = ebookVersionName
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.google.android.gms:play-services-auth:21.5.0")
}
