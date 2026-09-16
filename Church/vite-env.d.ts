/// <reference types="vite/client" />

/**
 * Capturing a playing media element as a stream is standard but not in the DOM
 * lib types. Firefox only ships the prefixed form, so both are declared and the
 * meeting code feature-detects rather than assuming either.
 */
interface HTMLMediaElement {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
}
