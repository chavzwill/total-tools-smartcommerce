export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  subcategory?: string;
  department: string;
  price: number;
  currency?: string;
  stockStatus: string;
  badge: string;
  image: string;
  tags: string[];
  rating: number;
  reviews: number;
  purchasable?: boolean;
  purchaseBlockedReason?: string;
  rentable?: boolean;
  description: string;
  specs: Record<string, string>;
};

export type Category = {
  name: string;
  description: string;
  image: string;
  icon: string;
};

export type RentalAddOn = {
  id: string;
  name: string;
  description?: string;
  category: "accessory" | "attachment" | "battery_power" | "operator" | "delivery_service" | "protection" | "consumable" | string;
  rateBasis: "flat" | "daily" | "weekly" | "monthly" | "hourly" | "per_unit" | "provider_quote" | string;
  unitPrice?: number;
  currency?: string;
  minimumQuantity?: number;
  maximumQuantity?: number;
  required?: boolean;
  availability?: "available" | "limited" | "requires_confirmation" | "unavailable" | string;
  scheduleRequired?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
};

export type RentalItem = {
  id: string;
  name: string;
  category: string;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  availability: string;
  branchAvailability: string;
  image: string;
  description: string;
  specs: Record<string, string>;
  addOns?: RentalAddOn[];
};

export type RepairType = {
  id: string;
  toolType: string;
  commonIssues: string[];
  startingPrice: number;
  turnaround: string;
};

export type AdvisorResponse = {
  needSummary: string;
  recommendedProducts: Product[];
  addOns: Product[];
  nextAction: string;
};
