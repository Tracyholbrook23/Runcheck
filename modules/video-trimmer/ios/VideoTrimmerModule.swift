/**
 * VideoTrimmerModule.swift
 *
 * Expo native module — on-device video trimming for iOS.
 * Uses AVAssetExportSession (AVFoundation) to export a time-range slice of a
 * local video to a new MP4 file in the system temporary directory.
 *
 * No extra CocoaPods dependencies required: AVFoundation is a system framework.
 */

import ExpoModulesCore
import AVFoundation

public class VideoTrimmerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoTrimmer")

    // trimVideo(sourceUri, startSec, endSec) → Promise<String>
    // Returns the file:// URI of the trimmed MP4.
    AsyncFunction("trimVideo") { (sourceUri: String, startSec: Double, endSec: Double, promise: Promise) in
      // ── 1. Resolve source URL ─────────────────────────────────────────────
      let sourceURL: URL
      if sourceUri.hasPrefix("file://") || sourceUri.hasPrefix("http://") || sourceUri.hasPrefix("https://") {
        guard let u = URL(string: sourceUri) else {
          promise.reject("INVALID_URI", "Cannot parse source URI: \(sourceUri)")
          return
        }
        sourceURL = u
      } else {
        // Bare file path (no scheme)
        sourceURL = URL(fileURLWithPath: sourceUri)
      }

      // ── 2. Build AVURLAsset with precise timing ───────────────────────────
      let asset = AVURLAsset(
        url: sourceURL,
        options: [AVURLAssetPreferPreciseDurationAndTimingKey: true]
      )

      // ── 3. Define the time range to export ───────────────────────────────
      let timescale: CMTimeScale = 600  // fine-grained for sub-frame precision
      let start     = CMTime(seconds: startSec, preferredTimescale: timescale)
      let end       = CMTime(seconds: endSec,   preferredTimescale: timescale)
      let timeRange = CMTimeRange(start: start, end: end)

      // ── 4. Create AVAssetExportSession ───────────────────────────────────
      guard let session = AVAssetExportSession(
        asset: asset,
        presetName: AVAssetExportPresetHighestQuality
      ) else {
        promise.reject("SESSION_FAILED", "Could not create AVAssetExportSession for: \(sourceUri)")
        return
      }

      // ── 5. Configure output ───────────────────────────────────────────────
      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString)
        .appendingPathExtension("mp4")

      session.outputURL                  = outputURL
      session.outputFileType             = .mp4
      session.timeRange                  = timeRange
      session.shouldOptimizeForNetworkUse = true

      // ── 6. Export asynchronously ──────────────────────────────────────────
      session.exportAsynchronously {
        switch session.status {
        case .completed:
          promise.resolve(outputURL.absoluteString)

        case .failed:
          let msg = session.error?.localizedDescription ?? "Unknown export error"
          promise.reject("EXPORT_FAILED", "AVAssetExportSession failed: \(msg)")

        case .cancelled:
          promise.reject("EXPORT_CANCELLED", "Export was cancelled")

        default:
          promise.reject("EXPORT_FAILED", "Unexpected export status: \(session.status.rawValue)")
        }
      }
    }
  }
}
