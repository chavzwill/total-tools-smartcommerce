import {
  ApiClient as ProductionApiClient,
  platformApiClient as productionPlatformApiClient,
  type ApiClientOptions as ProductionApiClientOptions,
} from "../apiClient";

export type ApiClientOptions = ProductionApiClientOptions & {
  getToken?: () => string | undefined;
};

export class ApiClient extends ProductionApiClient {
  constructor(options: ApiClientOptions = {}) {
    const { getToken, getAccessToken, ...rest } = options;

    super({
      ...rest,
      getAccessToken: getAccessToken || getToken,
    });
  }
}

export const platformApiClient = productionPlatformApiClient;
