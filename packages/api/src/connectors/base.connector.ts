import type { ConnectorType } from "@devglean/db";
import type { RawDocument, OAuthTokens, ConnectorSyncResult, DocumentMetadata } from "@devglean/shared";

export interface SyncCursor {
  [key: string]: unknown;
}

/**
 * Abstract base class for all data source connectors.
 * Each connector implements OAuth, data fetching, webhook validation,
 * and incremental sync.
 */
export abstract class BaseConnector {
  abstract readonly type: ConnectorType;

  /**
   * Build the OAuth authorization URL for user consent.
   */
  abstract buildOAuthUrl(state: string, redirectUri: string): string;

  /**
   * Exchange an OAuth authorization code for access + refresh tokens.
   */
  abstract exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<OAuthTokens>;

  /**
   * Fetch documents that have changed since the last sync cursor.
   * Returns raw documents and the new cursor position.
   */
  abstract fetchDiff(
    accessToken: string,
    cursor: SyncCursor | null,
    config?: Record<string, unknown>
  ): Promise<{
    docs: RawDocument[];
    nextCursor: SyncCursor;
    hasMore: boolean;
  }>;

  /**
   * Validate a webhook payload using the connector's signing mechanism.
   */
  abstract validateWebhook(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean;

  /**
   * Extract ACL groups from the source for a given document.
   */
  abstract extractAclGroups(
    accessToken: string,
    sourceId: string
  ): Promise<string[]>;
}
