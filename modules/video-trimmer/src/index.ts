/**
 * video-trimmer — JS entry point
 *
 * Thin wrapper around the native VideoTrimmer module.
 * On iOS: uses AVAssetExportSession (AVFoundation).
 * On Android: uses Jetpack Media3 Transformer.
 *
 * Usage:
 *   import { trimVideo } from 'video-trimmer';
 *   const trimmedUri = await trimVideo(sourceUri, 5.0, 15.0);
 *   // trimmedUri is a local file:// URI ready for upload
 */

import { requireNativeModule } from 'expo-modules-core';

const VideoTrimmer = requireNativeModule('VideoTrimmer');

/**
 * Trim a local video file to the specified time range and return the
 * URI of the trimmed output file.
 *
 * @param sourceUri  Local file URI of the source video (file:// or content://)
 * @param startSec   Trim start position in seconds (inclusive)
 * @param endSec     Trim end position in seconds (exclusive)
 * @returns          Promise<string> — file:// URI of the trimmed output
 */
export async function trimVideo(
  sourceUri: string,
  startSec: number,
  endSec: number,
): Promise<string> {
  return VideoTrimmer.trimVideo(sourceUri, startSec, endSec);
}
