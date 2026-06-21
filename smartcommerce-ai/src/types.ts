export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  subcategory?: string;
  department: string;
  price: number;
  stockStatus: string;
  badge: string;
  image: string;
  tags: string[];
  rating: number;
  reviews: number;
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
