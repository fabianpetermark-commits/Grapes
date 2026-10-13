plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.parcelize")
}

val samsungSdk = file("libs/samsung-health-data-api-1.1.0.aar")

android {
    namespace = "hu.grapes.healthconnect"
    compileSdk = 36
    defaultConfig {
        applicationId = "hu.grapes.healthconnect"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-poc"
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
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.google.code.gson:gson:2.13.2")
    if (samsungSdk.exists()) {
        implementation(files(samsungSdk))
    }
}
