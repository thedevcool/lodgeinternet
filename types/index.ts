export interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number; // For showing discounts
  image: string;
  images?: string[]; // Multiple product images
  category: string;
  description: string;
  specs?: {
    [key: string]: string;
  };
  inStock: boolean;
  stockQuantity: number; // Number of units available
  badge?: string;
  featured?: boolean;
  sectionId?: string; // Section this product belongs to
  availableDate?: Date; // For coming soon products with countdown
  restockDate?: Date; // When product was restocked (for "Back in Stock" badge)
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  userId?: string; // User ID from Firebase Auth
  items: OrderItem[];
  total: number;
  deliveryMethod: "door-to-door" | "station-pickup"; // New delivery option
  deliveryFee: number; // Delivery fee (₦500 for door-to-door, ₦0 for station pickup)
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  paymentStatus: "pending" | "paid" | "failed";
  orderStatus:
    | "packing"
    | "on-the-way"
    | "delivered-station"
    | "delivered-doorstep"; // Order tracking status
  paystackReference: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface User {
  id: string; // Firebase Auth UID
  email: string;
  displayName: string;
  photoURL?: string;
  emailPreferences?: {
    promotional: boolean; // Opt-in for promotional emails
    stockAlerts: boolean; // Opt-in for back-in-stock alerts
    orderUpdates: boolean; // Order status updates (default true)
    comingSoon: boolean; // Countdown and new product alerts
  };
  watchlist?: string[]; // Product IDs user wants to be notified about
  createdAt: Date;
  lastLoginAt: Date;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  image: string; // Category image for display
  displayOrder: number; // Order in which categories appear
  isActive: boolean; // Whether category is visible
  sectionId?: string; // Maps category to a section for filtering products
  createdAt: Date;
  updatedAt: Date;
}

export interface Section {
  id: string;
  name: string;
  description: string;
  displayOrder: number; // Order in which sections appear on homepage
  isActive: boolean; // Whether section is visible on homepage
  createdAt: Date;
  updatedAt: Date;
}

export interface DataPlan {
  id: string;
  name: string;
  planType: "device" | "tv" | "unlimited"; // Type of plan
  unlimitedPeriod?: "daily" | "weekly" | "monthly" | "yearly" | string; // Subtype for unlimited plans
  usersCount?: number; // Only for device plans (3 or 5)
  duration?: number; // For TV plans and unlimited - duration in days
  price: number;
  hostelId?: string; // Hostel this plan belongs to (undefined = legacy global plan)
  isActive: boolean;
  eligible?: boolean;
  enabled?: boolean;
  approved?: boolean;
  approvedForSale?: boolean;
  disabled?: boolean;
  status?: "approved_for_sale" | "needs_metadata" | "disabled" | "needs_approval";
  priceResolved?: boolean;
  priceSource?: "controller_default" | "hostel_override" | null;
  needsMetadataResolve?: boolean;
  source?: "local" | "controller";
  controllerId?: string;
  poolKey?: string;
  entitlementKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HostelCollage {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Hostel {
  id: string;
  name: string;
  collageId?: string; // Parent collage this hostel belongs to
  password?: string; // Network login password (e.g. LODGES01)
  planTypes?: string[]; // undefined / empty = all types available
  // Which device-plan variants this hostel offers, by device count (3 and/or 5).
  // undefined / empty = both (keeps existing hostels working unchanged).
  deviceUserCounts?: number[];
  // Server-authoritative controller membership (null when the hostel is
  // standalone). Populated by the backend from the cached controller mapping.
  controllerId?: string | null;
  controllerName?: string | null;
  // Absent/true = trading normally. false = the installation has been pulled:
  // nothing sells here and any running TV access has been revoked. Written by
  // POST /api/admin/hostels/status, never by this record's own create/update.
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataCode {
  id: string;
  planId: string;
  hostel: string;
  codeMask: string;
  createdAt: Date;
}

export interface TVSubscription {
  id: string;
  userId: string; // Firebase Auth user ID
  name: string;
  email: string;
  macAddressHash: string; // Encrypted TV MAC address for admin viewing
  planId: string;
  planName: string;
  duration: number; // Duration in days
  price: number;
  hostel?: string; // Hostel where subscriber lives
  paymentRef: string;
  paymentStatus: "paid";
  subscriptionStatus: "pending_activation" | "active" | "expired";
  paidAt: Date;
  activatedAt?: Date; // When admin activates
  expiresAt?: Date; // Calculated from activatedAt + duration
  expiryReminderSent?: boolean; // Flag to track if expiry reminder was sent
  createdAt: Date;
  updatedAt: Date;
}

// ─── User Accounts ───────────────────────────────────────────────────────────

export interface UserProfile {
  id: string; // Firebase Auth UID
  email: string;
  displayName: string;
  hostelId: string; // Hostel name — locked to profile
  hostelSlug: string;
  collageSlug?: string; // Parent collage slug for nested URL routing
  emailVerified: boolean;
  isActive?: boolean; // undefined / true = active; false = disabled by admin
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPurchase {
  id: string;
  planId: string;
  planName: string;
  planType: "device" | "tv" | "unlimited";
  price: number;
  paymentRef: string;
  hostel: string;
  purchasedAt: Date;
}

// ─── Admin Management ─────────────────────────────────────────────────────────

export type AdminModule =
  | "data-codes"
  | "tv-users"
  | "purchase-logs"
  | "transactions"
  | "emails"
  | "migrations"
  | "hostels"
  | "settings"
  | "users"
  | "waitlist"
  | "controllers";

export type AdminPermission = "read" | "write" | "read-write";

/** Permission assigned to a single module */
export interface ModulePermission {
  module: AdminModule;
  permission: AdminPermission;
}

export interface AdminUser {
  id: string;
  username: string;
  email?: string;
  /** WhatsApp phone number, e.g. 2348012345678 (no + prefix) */
  whatsappPhone?: string;
  /** bcrypt hash — never expose to clients */
  passwordHash: string;
  role: "admin";
  /** Per-module permission — only listed modules are accessible */
  modulePermissions: ModulePermission[];
  /**
   * Hostel IDs this admin may access.
   * Empty array = unrestricted (all hostels).
   */
  hostels: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  /** Partner accounts see a restricted read-only split view */
  isPartner?: boolean;
  /** Partner's cut as a % of each transaction's full amount (used in "whole" mode). */
  partnerSplitPercent?: number;
  /** "whole" = one split for all hostels; "perHostel" = a split per hostel. */
  partnerSplitMode?: PartnerSplitMode;
  /** Per-hostel split %, keyed by hostel ID. Used only in "perHostel" mode. */
  partnerHostelSplits?: Record<string, number>;
}

/** How a partner's split is configured across their hostels. */
export type PartnerSplitMode = "whole" | "perHostel";

export interface AdminProfile {
  username: string;
  role: "super-admin" | "admin";
  modulePermissions: ModulePermission[];
  /** Empty = all hostels; otherwise restricted to listed hostel IDs */
  hostels: string[];
  isSuperAdmin: boolean;
  /** Partner accounts see a restricted read-only split view */
  isPartner?: boolean;
  /** Partner's cut as a % of each transaction's full amount (used in "whole" mode). */
  partnerSplitPercent?: number;
  /** "whole" = one split for all hostels; "perHostel" = a split per hostel. */
  partnerSplitMode?: PartnerSplitMode;
  /** Per-hostel split %, keyed by hostel ID. Used only in "perHostel" mode. */
  partnerHostelSplits?: Record<string, number>;
}
