export type CourierStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'suspended';
export type CourierAction = 'submit' | 'approve' | 'reject' | 'suspend' | 'reinstate';
export type CourierApplicationInput = {
  businessName: string; contactName: string; email: string; phone: string; description: string;
};
export type CourierApplication = CourierApplicationInput & {
  id: string; status: CourierStatus; version: number; decisionReason: string | null; updatedAt: string;
  history?: Array<{action:string;reason:string|null;createdAt:string;version:number}>;
};
export type CourierActor = {kind:'owner';customerId:string} | {kind:'staff';employeeId:string;branchIds?:string[];permissions:Record<string,boolean>};
export type CourierRate = {categoryId:string;originAreaId:string;destinationAreaId:string;minWeightGrams:number;maxWeightGrams:number;priceMinor:number};
export type CourierServiceInput = {
  name:string;currency:string;timezone:string;originAreaIds:string[];destinationAreaIds:string[];categoryIds:string[];
  mode:'branch_to_address'|'branch_to_collection_point';collectionPointIds:string[];
  minBusinessDays:number;maxBusinessDays:number;cutoffLocal:string;dailyCapacity:number;available:boolean;
  maxWeightGrams:number;maxLengthMm:number;maxWidthMm:number;maxHeightMm:number;
  hours:Array<{weekday:number;opens:string;closes:string}>;closures:string[];rates:CourierRate[];
};
export type CourierService = {id:string;organizationId:string;version:number;published:boolean;input:CourierServiceInput};
export type CourierReferences = {areas:Array<{id:string;name?:string}>;categories:Array<{id:string;name?:string}>;collectionPoints:Array<{id:string;name?:string}>;currencies:string[]};
export type CourierWorkspace = {application:CourierApplication|null;services:CourierService[];references:CourierReferences;bookingAvailable:false};
