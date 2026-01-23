/**
 * Creator Profile Data Types
 * 
 * These interfaces represent REAL data from the backend API.
 * DO NOT populate with mock or fake data.
 */

export interface CreatorProfileData {
  /**
   * Available collaboration methods
   * e.g. ["Sponsored Post", "Affiliate", "Product Review"]
   */
  collaborationMethods?: string[]

  /**
   * Contact information
   * Only render fields that exist
   */
  contact?: {
    instagram?: string  // Username only (e.g., "emmachen")
    email?: string      // Valid email address
    website?: string    // Full URL
  }

  /**
   * Past brand collaborations
   * Only render if array has items
   */
  pastBrands?: {
    id: string
    name: string
    logoUrl?: string    // Optional brand logo
  }[]
}
