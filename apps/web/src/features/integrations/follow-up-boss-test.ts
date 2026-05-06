import { createFollowUpBossClient } from "@realty-ops/integrations";
import { decryptCredential } from "../../lib/credentials";

export type FollowUpBossCredentialRepository = {
  findConnectedCredential(workspaceId: string): Promise<{
    integrationAccountId: string;
    workspaceId: string;
    encryptedCredentialRef: string;
  } | null>;
};

export type FollowUpBossTestConnectionResult = {
  success: true;
  message: string;
} | {
  success: false;
  error: string;
  errorCode: string;
};

export async function verifyFollowUpBossApiKey(params: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<FollowUpBossTestConnectionResult> {
  try {
    const client = createFollowUpBossClient(params.fetchImpl === undefined
      ? { apiKey: params.apiKey }
      : { apiKey: params.apiKey, fetchImpl: params.fetchImpl });

    await client.fetchResource("/teams");

    return {
      success: true,
      message: "Successfully connected to Follow Up Boss",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("401") || errorMessage.includes("unauthorized")) {
      return {
        success: false,
        error: "Invalid Follow Up Boss API key",
        errorCode: "authentication_failed",
      };
    }

    if (errorMessage.includes("404")) {
      return {
        success: false,
        error: "Follow Up Boss API endpoint not found",
        errorCode: "endpoint_not_found",
      };
    }

    if (errorMessage.includes("429")) {
      return {
        success: false,
        error: "Too many requests to Follow Up Boss API",
        errorCode: "rate_limited",
      };
    }

    return {
      success: false,
      error: `Follow Up Boss connection test failed: ${errorMessage}`,
      errorCode: "connection_test_failed",
    };
  }
}

export async function testFollowUpBossConnection(params: {
  workspaceId: string;
  credentialSecret: string;
  repository: FollowUpBossCredentialRepository;
  fetchImpl?: typeof fetch;
}): Promise<FollowUpBossTestConnectionResult> {
  const credential = await params.repository.findConnectedCredential(params.workspaceId);
  
  if (!credential) {
    return {
      success: false,
      error: "No Follow Up Boss credential found for this workspace",
      errorCode: "credential_not_found",
    };
  }

  try {
    const decrypted = decryptCredential<{ apiKey: string }>(
      credential.encryptedCredentialRef,
      params.credentialSecret,
    );

    return verifyFollowUpBossApiKey(params.fetchImpl === undefined
      ? { apiKey: decrypted.apiKey }
      : { apiKey: decrypted.apiKey, fetchImpl: params.fetchImpl });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: `Follow Up Boss connection test failed: ${errorMessage}`,
      errorCode: "connection_test_failed",
    };
  }
}
