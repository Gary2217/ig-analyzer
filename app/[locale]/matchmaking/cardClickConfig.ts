/**
 * Configuration for creator card click behavior
 * Allows switching between different interaction patterns without rewriting UI
 */

export type CardClickBehavior = 
  | "NAVIGATE_PROFILE"  // Navigate to public profile page
  | "OPEN_DETAILS"      // Open drawer/sheet with details
  | "GATED"             // Check auth before showing details

export type CardClickConfig = {
  behavior: CardClickBehavior
  /**
   * For GATED behavior: what to do after successful auth
   * Defaults to NAVIGATE_PROFILE if not specified
   */
  postGateTarget?: "NAVIGATE_PROFILE" | "OPEN_DETAILS"
}

/**
 * Default configuration for creator card clicks
 * Can be overridden per-page or per-component
 * 
 * Default is OPEN_DETAILS (mobile-first bottom sheet) to avoid 404
 * until profile routes are fully implemented
 */
export const DEFAULT_CARD_CLICK_CONFIG: CardClickConfig = {
  behavior: "OPEN_DETAILS",
  postGateTarget: "OPEN_DETAILS",
}
