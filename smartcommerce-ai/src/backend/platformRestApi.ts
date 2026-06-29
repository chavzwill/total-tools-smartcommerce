import type {
  CommercialQuoteRequest,
  CustomerAccount,
  PlatformApiResult,
  PlatformInvoice,
  PlatformOrder,
  PlatformWebhookEvent,
  RentalReservationRequest,
  RepairRequest,
} from "../platform";
import type {
  AssistantRequest,
  CheckoutRequest,
  PlatformBackendService,
} from "./platformBackendTypes";
import {
  pendingProductMutation,
  pendingRentalAssetMutation,
  pendingRepairCatalogMutation,
  pendingInvoiceLookup,
} from "./platformBackendService";

const json = <T>(result: PlatformApiResult<T>, init?: ResponseInit) =>
  new Response(JSON.stringify(result), {
    status: result.success ? init?.status || 200 : init?.status || 400,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

const notFound = (path: string) =>
  json(
    {
      success: false,
      error: {
        code: "ENDPOINT_NOT_FOUND",
        message: `No platform endpoint is registered for ${path}.`,
      },
    },
    { status: 404 }
  );

const methodNotAllowed = (method: string, path: string) =>
  json(
    {
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: `${method} is not allowed for ${path}.`,
      },
    },
    { status: 405 }
  );

const readJson = async <T>(request: Request): Promise<T> => {
  const body = await request.text();
  return body ? (JSON.parse(body) as T) : ({} as T);
};

const paramsFromSearch = (url: URL) =>
  Object.fromEntries(url.searchParams.entries());

export async function handlePlatformRestRequest(
  request: Request,
  service: PlatformBackendService
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");
  const segments = path.split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  if (path === "/platform/sync/products" && method === "POST") {
    return json(await service.syncProducts(request));
  }

  if (path === "/platform/sync/rentals" && method === "POST") {
    return json(await service.syncRentals(request));
  }

  if (path === "/platform/sync/repairs" && method === "POST") {
    return json(await service.syncRepairs(request));
  }

  if (path === "/platform/products") {
    if (method === "GET") {
      return json(await service.searchProducts(request, paramsFromSearch(url)));
    }
    if (method === "POST") return json(pendingProductMutation(), { status: 501 });
    return methodNotAllowed(method, path);
  }

  if (segments[0] === "platform" && segments[1] === "products" && segments[2]) {
    if (method === "GET") {
      return json(await service.getProductById(request, segments[2]));
    }
    if (method === "PUT" || method === "DELETE") {
      return json(pendingProductMutation(), { status: 501 });
    }
    return methodNotAllowed(method, path);
  }

  if (path === "/platform/rentals") {
    if (method === "GET") {
      return json(await service.listRentalAssets(request, paramsFromSearch(url)));
    }
    if (method === "POST") {
      return json(pendingRentalAssetMutation(), { status: 501 });
    }
    return methodNotAllowed(method, path);
  }

  if (path === "/platform/rentals/assets") {
    if (method === "GET") {
      return json(await service.listRentalAssets(request, paramsFromSearch(url)));
    }
    if (method === "POST") {
      return json(pendingRentalAssetMutation(), { status: 501 });
    }
    return methodNotAllowed(method, path);
  }

  if (
    segments[0] === "platform" &&
    segments[1] === "rentals" &&
    segments[2] === "assets" &&
    segments[3]
  ) {
    if (method === "GET") {
      return json(await service.getRentalAssetById(request, segments[3]));
    }
    if (method === "PUT" || method === "DELETE") {
      return json(pendingRentalAssetMutation(), { status: 501 });
    }
    return methodNotAllowed(method, path);
  }

  if (path === "/platform/rentals/availability" && method === "GET") {
    return json(
      await service.getRentalAvailability(
        request,
        paramsFromSearch(url) as {
          startDate: string;
          endDate: string;
          rentalAssetId?: string;
          productId?: string;
          branchId?: string;
        }
      )
    );
  }

  if (path === "/platform/rentals/reservations" && method === "POST") {
    return json(
      await service.createRentalReservation(
        request,
        await readJson<RentalReservationRequest>(request)
      ),
      { status: 201 }
    );
  }

  if (path === "/platform/repairs/catalog") {
    if (method === "GET") return json(await service.listRepairCatalog(request));
    if (method === "POST") {
      return json(pendingRepairCatalogMutation(), { status: 501 });
    }
    return methodNotAllowed(method, path);
  }

  if (path === "/platform/repairs") {
    if (method === "GET") return json(await service.listRepairCatalog(request));
    if (method === "POST") {
      return json(
        await service.createRepairRequest(
          request,
          await readJson<RepairRequest>(request)
        ),
        { status: 201 }
      );
    }
    return methodNotAllowed(method, path);
  }

  if (
    segments[0] === "platform" &&
    segments[1] === "repairs" &&
    segments[2] === "catalog" &&
    segments[3]
  ) {
    if (method === "PUT" || method === "DELETE") {
      return json(pendingRepairCatalogMutation(), { status: 501 });
    }
    return methodNotAllowed(method, path);
  }

  if (path === "/platform/repairs/requests" && method === "POST") {
    return json(
      await service.createRepairRequest(
        request,
        await readJson<RepairRequest>(request)
      ),
      { status: 201 }
    );
  }

  if (
    segments[0] === "platform" &&
    segments[1] === "repairs" &&
    segments[2] === "jobs" &&
    segments[3] &&
    method === "GET"
  ) {
    return json(await service.getRepairJobById(request, segments[3]));
  }

  if (path === "/platform/commercial/quotes" && method === "POST") {
    return json(
      await service.createCommercialQuote(
        request,
        await readJson<CommercialQuoteRequest>(request)
      ),
      { status: 201 }
    );
  }

  if (path === "/platform/customers") {
    if (method === "POST") {
      return json(
        await service.createCustomer(
          request,
          await readJson<CustomerAccount>(request)
        ),
        { status: 201 }
      );
    }
    return methodNotAllowed(method, path);
  }

  if (
    segments[0] === "platform" &&
    segments[1] === "customers" &&
    segments[2]
  ) {
    if (method === "GET") {
      return json(await service.getCustomerById(request, segments[2]));
    }
    return methodNotAllowed(method, path);
  }

  if (path === "/platform/orders") {
    if (method === "POST") {
      return json(
        await service.createOrder(request, await readJson<PlatformOrder>(request)),
        { status: 201 }
      );
    }
    return methodNotAllowed(method, path);
  }

  if (
    segments[0] === "platform" &&
    segments[1] === "orders" &&
    segments[2]
  ) {
    if (method === "GET") {
      return json(await service.getOrderById(request, segments[2]));
    }
    return methodNotAllowed(method, path);
  }

  if (path === "/platform/invoices") {
    if (method === "POST") {
      return json(
        await service.createInvoice(
          request,
          await readJson<PlatformInvoice>(request)
        ),
        { status: 201 }
      );
    }
    if (method === "GET") {
      return json(pendingInvoiceLookup(), { status: 501 });
    }
    return methodNotAllowed(method, path);
  }

  if (
    segments[0] === "platform" &&
    segments[1] === "invoices" &&
    segments[2]
  ) {
    if (method === "GET") {
      return json(await service.getInvoiceById(request, segments[2]), {
        status: 501,
      });
    }
    return methodNotAllowed(method, path);
  }

  if (path === "/platform/assistant" && method === "POST") {
    return json(
      await service.runAssistant(
        request,
        await readJson<AssistantRequest>(request)
      )
    );
  }

  if (path === "/platform/checkout" && method === "POST") {
    return json(
      await service.checkout(request, await readJson<CheckoutRequest>(request)),
      { status: 201 }
    );
  }

  if (path === "/platform/integrations/webhooks" && method === "POST") {
    return json(
      await service.handleWebhook(
        request,
        await readJson<PlatformWebhookEvent>(request)
      )
    );
  }

  return notFound(path);
}
