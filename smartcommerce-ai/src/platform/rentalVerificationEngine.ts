import type {
  InventoryAvailability,
  PlatformApiResult,
  RentalCustomerEligibility,
  RentalMachineVerification,
  RentalReservationRequest,
  RentalReservationResult,
  RentalScheduleVerification,
  RentalVerificationDecision,
  RentalVerificationResult,
} from "./contracts";
import type {
  PosAdapter,
  PosAdapterContext,
  RentalVerificationQuery,
} from "./posAdapter";

const now = () => new Date().toISOString();

const fail = <T>(code: string, message: string, details?: unknown): PlatformApiResult<T> => ({
  success: false,
  error: { code, message, details, retryable: false },
});

const normalizeMachine = (
  asset: Awaited<ReturnType<PosAdapter["getRentalAssetById"]>>,
  request: RentalReservationRequest
): RentalMachineVerification => {
  const checkedAt = now();
  if (!asset.success) {
    return {
      rentalAssetId: request.rentalAssetId,
      productId: request.productId,
      branchId: request.branchId,
      verified: false,
      rentable: false,
      status: "unknown",
      holdReasons: ["rental_asset_verification_failed"],
      checkedAt,
    };
  }

  const status = asset.data.status;
  const rentable = status === "available";
  return {
    rentalAssetId: asset.data.id,
    productId: asset.data.productId || request.productId,
    branchId: asset.data.branchId || request.branchId,
    verified: true,
    rentable,
    status,
    holdReasons: rentable ? undefined : [`asset_status:${status}`],
    checkedAt,
    externalRefs: asset.data.externalRefs,
  };
};

const chooseAvailability = (
  rows: InventoryAvailability[],
  request: RentalReservationRequest
): RentalScheduleVerification => {
  const checkedAt = now();
  const requestedQuantity = Math.max(1, request.quantity || 1);
  const candidates = request.branchId
    ? rows.filter((row) => !row.branchId || row.branchId === request.branchId)
    : rows;
  const usable = candidates.filter((row) => {
    if (typeof row.quantityAvailable === "number") {
      return row.quantityAvailable >= requestedQuantity;
    }
    return row.status === "in_stock" || row.status === "low_stock";
  });
  const best = usable[0];

  if (best) {
    return {
      requestedStartDate: request.startDate,
      requestedEndDate: request.endDate,
      branchId: best.branchId || request.branchId,
      quantityRequested: requestedQuantity,
      available: true,
      status: best.branchId && request.branchId && best.branchId !== request.branchId
        ? "available_other_branch"
        : "available",
      quantityAvailable: best.quantityAvailable,
      checkedAt,
    };
  }

  const nextAvailable = candidates
    .map((row) => row.nextAvailableAt)
    .filter((value): value is string => !!value)
    .sort()[0];
  const alternateBranchIds = rows
    .filter((row) => row.branchId && row.branchId !== request.branchId)
    .filter((row) =>
      typeof row.quantityAvailable === "number"
        ? row.quantityAvailable >= requestedQuantity
        : row.status === "in_stock" || row.status === "low_stock"
    )
    .map((row) => row.branchId!)
    .filter((value, index, all) => all.indexOf(value) === index);

  return {
    requestedStartDate: request.startDate,
    requestedEndDate: request.endDate,
    branchId: request.branchId,
    quantityRequested: requestedQuantity,
    available: false,
    status: alternateBranchIds.length
      ? "available_other_branch"
      : nextAvailable
        ? "available_later"
        : "unavailable",
    nextAvailableAt: nextAvailable,
    alternateBranchIds: alternateBranchIds.length ? alternateBranchIds : undefined,
    checkedAt,
  };
};

const unresolvedCustomerEligibility = (
  request: RentalReservationRequest,
  customerExists: boolean
): RentalCustomerEligibility => ({
  customerAccountId: request.customerAccountId,
  verified: false,
  eligible: false,
  accountStanding: "unknown",
  identityVerificationRequired: true,
  outstandingRequirements: [
    ...(request.customerAccountId && customerExists ? [] : ["customer_account_verification_required"]),
    "customer_rental_eligibility_verification_required",
  ],
  manualReviewRequired: true,
  checkedAt: now(),
});

const decide = (
  machine: RentalMachineVerification,
  availability: RentalScheduleVerification,
  customer: RentalCustomerEligibility
): RentalVerificationDecision => {
  if (!machine.verified || !machine.rentable) return "rejected";
  if (!availability.available) return "rejected";
  if (customer.manualReviewRequired) return "manual_review";
  if (!customer.verified || !customer.eligible) return "conditional";
  if (
    customer.outstandingRequirements?.length ||
    customer.certificationRequirements?.length ||
    customer.insuranceRequirements?.length
  ) {
    return "conditional";
  }
  return "approved";
};

export const isRentalVerificationApproved = (verification: RentalVerificationResult) =>
  verification.decision === "approved" &&
  verification.machine.verified &&
  verification.machine.rentable &&
  verification.availability.available &&
  verification.customer.verified &&
  verification.customer.eligible &&
  !verification.customer.manualReviewRequired &&
  !(verification.outstandingRequirements?.length || verification.customer.outstandingRequirements?.length);

export async function verifyRentalReservation(
  adapter: PosAdapter,
  context: PosAdapterContext,
  request: RentalReservationRequest
): Promise<PlatformApiResult<RentalVerificationResult>> {
  if (!request.rentalAssetId && !request.productId) {
    return fail(
      "RENTAL_ASSET_REQUIRED",
      "A rental asset or product must be selected before rental verification."
    );
  }
  if (new Date(request.endDate).getTime() <= new Date(request.startDate).getTime()) {
    return fail(
      "RENTAL_DATE_RANGE_INVALID",
      "The rental end date must be after the rental start date."
    );
  }

  const verificationQuery: RentalVerificationQuery = {
    rentalAssetId: request.rentalAssetId,
    productId: request.productId,
    branchId: request.branchId,
    customerAccountId: request.customerAccountId,
    startDate: request.startDate,
    endDate: request.endDate,
    quantity: request.quantity,
    requireIdentityVerification: true,
    requireAccountStanding: true,
    requireCertificationCheck: true,
    requireInsuranceCheck: true,
    metadata: request.metadata,
  };

  if (adapter.verifyRental) {
    const native = await adapter.verifyRental(context, verificationQuery);
    if (!native.success) return native;

    const normalizedDecision = decide(
      native.data.machine,
      native.data.availability,
      native.data.customer
    );
    const normalized: RentalVerificationResult = {
      ...native.data,
      businessAccountId: context.businessAccountId,
      decision: normalizedDecision,
      verifiedAt: native.data.verifiedAt || now(),
    };
    return { ...native, data: normalized };
  }

  if (!request.rentalAssetId) {
    return {
      success: true,
      data: {
        businessAccountId: context.businessAccountId,
        decision: "manual_review",
        machine: {
          productId: request.productId,
          branchId: request.branchId,
          verified: false,
          rentable: false,
          status: "unknown",
          holdReasons: ["provider_asset_identity_verification_required"],
          checkedAt: now(),
        },
        availability: {
          requestedStartDate: request.startDate,
          requestedEndDate: request.endDate,
          branchId: request.branchId,
          quantityRequested: request.quantity || 1,
          available: false,
          status: "unknown",
          checkedAt: now(),
        },
        customer: unresolvedCustomerEligibility(request, false),
        outstandingRequirements: [
          "provider_asset_identity_verification_required",
          "customer_rental_eligibility_verification_required",
        ],
        reasons: ["The provider does not expose native rental verification for this request."],
        verifiedAt: now(),
      },
    };
  }

  const [asset, availability, customer] = await Promise.all([
    adapter.getRentalAssetById(context, request.rentalAssetId),
    adapter.getRentalAvailability(context, verificationQuery),
    request.customerAccountId
      ? adapter.getCustomerById(context, request.customerAccountId)
      : Promise.resolve(undefined),
  ]);

  const machine = normalizeMachine(asset, request);
  const schedule = availability.success
    ? chooseAvailability(availability.data, request)
    : {
        requestedStartDate: request.startDate,
        requestedEndDate: request.endDate,
        branchId: request.branchId,
        quantityRequested: request.quantity || 1,
        available: false,
        status: "unknown",
        conflicts: [{ type: "availability_verification_failed", message: availability.error.message }],
        checkedAt: now(),
      } satisfies RentalScheduleVerification;
  const customerEligibility = unresolvedCustomerEligibility(
    request,
    !!customer?.success
  );
  const decision = decide(machine, schedule, customerEligibility);
  const outstandingRequirements = [
    ...(machine.holdReasons || []),
    ...(schedule.available ? [] : ["requested_schedule_not_verified_available"]),
    ...(customerEligibility.outstandingRequirements || []),
  ];

  return {
    success: true,
    data: {
      businessAccountId: context.businessAccountId,
      decision,
      machine,
      availability: schedule,
      customer: customerEligibility,
      outstandingRequirements,
      reasons: [
        "Provider-native customer eligibility verification is unavailable; SmartCommerce will not infer eligibility from a customer record alone.",
      ],
      verifiedAt: now(),
    },
  };
}

export async function createVerifiedRentalReservation(
  adapter: PosAdapter,
  context: PosAdapterContext,
  request: RentalReservationRequest
): Promise<PlatformApiResult<RentalReservationResult>> {
  const verificationResult = await verifyRentalReservation(adapter, context, request);
  if (!verificationResult.success) return verificationResult;
  const verification = verificationResult.data;

  if (!isRentalVerificationApproved(verification)) {
    const status: RentalReservationResult["status"] =
      verification.decision === "rejected"
        ? "declined"
        : verification.decision === "manual_review"
          ? "manual_review"
          : "conditional";
    return {
      success: true,
      data: {
        id: `verification:${context.requestId || Date.now()}`,
        businessAccountId: context.businessAccountId,
        status,
        rentalAssetId: request.rentalAssetId,
        productId: request.productId,
        customerAccountId: request.customerAccountId,
        verification,
        metadata: request.metadata,
      },
    };
  }

  const providerReservation = await adapter.createRentalReservation(context, {
    ...request,
    verification,
  });
  if (!providerReservation.success) return providerReservation;

  return {
    ...providerReservation,
    data: {
      ...providerReservation.data,
      verification,
      status:
        providerReservation.data.status === "confirmed" ||
        providerReservation.data.status === "reserved"
          ? providerReservation.data.status
          : "reserved",
    },
  };
}
