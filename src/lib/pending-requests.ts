/** Fired after the admin decides on a request, so the nav badge refreshes straight away. */
export const PENDING_CHANGED_EVENT = "pending-requests-changed";

export function notifyPendingChanged() {
  window.dispatchEvent(new Event(PENDING_CHANGED_EVENT));
}
