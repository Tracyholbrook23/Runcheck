/**
 * VideoTrimmerModule.kt
 *
 * Expo native module — on-device video trimming for Android.
 * Uses Jetpack Media3 Transformer to export a clipped segment of a local
 * video to a new MP4 file in the app's cache directory.
 *
 * Media3 Transformer must be created and started on a thread with a Looper
 * (main thread). Listener callbacks are delivered on that same thread.
 * The Expo Promise can be resolved/rejected from any thread.
 */

@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package expo.modules.videotrimmer

import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.transformer.Composition
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

class VideoTrimmerModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("VideoTrimmer")

    // trimVideo(sourceUri, startSec, endSec) → Promise<String>
    // Returns a file:// URI of the trimmed MP4 in the app cache directory.
    AsyncFunction("trimVideo") { sourceUri: String, startSec: Double, endSec: Double, promise: Promise ->

      val context = requireNotNull(appContext.reactContext) {
        "VideoTrimmerModule: React context is null — cannot trim video"
      }

      // Output file in app cache directory (managed by OS, auto-cleaned)
      val outputFile = File(context.cacheDir, "${UUID.randomUUID()}.mp4")

      // Build MediaItem with clipping configuration
      val mediaItem = MediaItem.Builder()
        .setUri(Uri.parse(sourceUri))
        .setClippingConfiguration(
          MediaItem.ClippingConfiguration.Builder()
            .setStartPositionMs((startSec * 1000.0).toLong())
            .setEndPositionMs((endSec   * 1000.0).toLong())
            .build()
        )
        .build()

      // Transformer must be created and started on a thread that has a Looper.
      // We use the main thread, which satisfies this requirement.
      Handler(Looper.getMainLooper()).post {
        val transformer = Transformer.Builder(context)
          .addListener(object : Transformer.Listener {

            override fun onCompleted(
              composition: Composition,
              exportResult: ExportResult,
            ) {
              promise.resolve("file://${outputFile.absolutePath}")
            }

            override fun onError(
              composition: Composition,
              exportResult: ExportResult,
              exportException: ExportException,
            ) {
              promise.reject(
                "TRIM_FAILED",
                exportException.message ?: "Media3 Transformer export failed",
                exportException,
              )
            }
          })
          .build()

        transformer.start(mediaItem, outputFile.absolutePath)
      }
    }
  }
}
