import java.util.Properties
plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
val signingProperties = Properties().apply {
 val source = rootProject.file("signing.properties")
 if (source.exists()) source.inputStream().use { load(it) }
}
android {
 namespace = "ai.ganegime.app"
 compileSdk = 36
 useLibrary("android.car")
 defaultConfig { applicationId = "ai.ganegime.app"; minSdk = 33; targetSdk = 34; versionCode = 11; versionName = "0.6.5"; testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner" }
 signingConfigs {
  create("submission") {
   if (signingProperties.isNotEmpty()) {
    storeFile = rootProject.file(signingProperties.getProperty("storeFile"))
    storePassword = signingProperties.getProperty("storePassword")
    keyAlias = signingProperties.getProperty("keyAlias")
    keyPassword = signingProperties.getProperty("keyPassword")
   }
  }
 }
 buildTypes {
  getByName("release") {
   // Separate install preserves the existing development app and its saved plans.
   applicationIdSuffix = ".release"
   isDebuggable = false
   isMinifyEnabled = false
   signingConfig = signingConfigs.getByName("submission")
  }
 }
 testBuildType = providers.gradleProperty("testBuildType").getOrElse("debug")
 compileOptions { sourceCompatibility = JavaVersion.VERSION_11; targetCompatibility = JavaVersion.VERSION_11 }
 kotlinOptions { jvmTarget = "11" }
}
dependencies {
 implementation("ai.pleos.playground:NaviHelper:3.0.5")
 androidTestImplementation("androidx.test:runner:1.6.2")
 androidTestImplementation("androidx.test:rules:1.6.1")
 androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
