export const DEMO_REFERENCE_TIME = "2026-07-30T12:00:00.000Z";
export const EXPECTED_PROCESSING_WINDOW_MINUTES = 240;

export function isInsideExpectedProcessingWindow(
  processingStartedAt: string,
  referenceTime = DEMO_REFERENCE_TIME,
): boolean {
  const elapsedMilliseconds =
    new Date(referenceTime).getTime() - new Date(processingStartedAt).getTime();

  return (
    elapsedMilliseconds >= 0 &&
    elapsedMilliseconds <= EXPECTED_PROCESSING_WINDOW_MINUTES * 60_000
  );
}
