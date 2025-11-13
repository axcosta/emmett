import type { Event, ReadEvent } from '@event-driven-io/emmett';
import type { RealtimeDBReadEventMetadata } from './realtimeDBProjection';

/**
 * Helper function to convert event metadata from various sources to RealtimeDB format
 * This is useful when consuming events from different event stores (like Firestore)
 * and projecting them to RealtimeDB.
 *
 * @example
 * ```typescript
 * // Convert Firestore event metadata
 * const realtimeDBEvent = toRealtimeDBMetadata(firestoreEvent);
 *
 * // Add custom metadata fields
 * const realtimeDBEvent = toRealtimeDBMetadata(firestoreEvent, {
 *   clientId: extractClientId(firestoreEvent)
 * });
 * ```
 */
export const toRealtimeDBMetadata = <
  EventType extends Event,
  SourceMetadata extends Record<string, unknown>,
  CustomMetadata extends Record<string, unknown> = Record<string, never>,
>(
  event: ReadEvent<EventType, SourceMetadata>,
  customMetadata?: CustomMetadata,
): ReadEvent<EventType, RealtimeDBReadEventMetadata & CustomMetadata> => {
  const sourceMetadata = event.metadata as Record<string, unknown>;

  // Extract standard metadata fields
  const messageId =
    typeof sourceMetadata.messageId === 'string'
      ? sourceMetadata.messageId
      : undefined;

  const streamName =
    typeof sourceMetadata.streamName === 'string'
      ? sourceMetadata.streamName
      : undefined;

  const streamPosition =
    typeof sourceMetadata.streamPosition === 'bigint'
      ? sourceMetadata.streamPosition
      : typeof sourceMetadata.streamPosition === 'number'
        ? BigInt(sourceMetadata.streamPosition)
        : typeof sourceMetadata.streamPosition === 'string'
          ? BigInt(sourceMetadata.streamPosition)
          : undefined;

  // Build RealtimeDB metadata
  const realtimeDBMetadata: RealtimeDBReadEventMetadata = {
    messageId,
    streamName: streamName ?? '',
    streamPosition: streamPosition ?? 0n,
  };

  return {
    type: event.type,
    data: event.data,
    metadata: {
      ...realtimeDBMetadata,
      ...(customMetadata ?? {}),
    } as RealtimeDBReadEventMetadata & CustomMetadata,
  };
};

/**
 * Helper to extract a field from event metadata or data
 * Useful for extracting aggregation keys like clientId
 *
 * @example
 * ```typescript
 * const clientId = extractFromEvent(event, 'clientId', 'metadata');
 * const customerId = extractFromEvent(event, 'customerId', 'data');
 * ```
 */
export const extractFromEvent = <T = string>(
  event: ReadEvent<Event, Record<string, unknown>>,
  field: string,
  source: 'metadata' | 'data' = 'metadata',
): T | undefined => {
  const obj = source === 'metadata' ? event.metadata : event.data;
  const value = (obj as Record<string, unknown>)[field];
  return value as T | undefined;
};

/**
 * Helper to convert a batch of events to RealtimeDB format
 *
 * @example
 * ```typescript
 * const realtimeDBEvents = toRealtimeDBMetadataBatch(firestoreEvents, (event) => ({
 *   clientId: extractClientId(event)
 * }));
 * ```
 */
export const toRealtimeDBMetadataBatch = <
  EventType extends Event,
  SourceMetadata extends Record<string, unknown>,
  CustomMetadata extends Record<string, unknown> = Record<string, never>,
>(
  events: Array<ReadEvent<EventType, SourceMetadata>>,
  customMetadataFn?: (
    event: ReadEvent<EventType, SourceMetadata>,
  ) => CustomMetadata,
): Array<
  ReadEvent<EventType, RealtimeDBReadEventMetadata & CustomMetadata>
> => {
  return events.map((event) =>
    toRealtimeDBMetadata(event, customMetadataFn?.(event)),
  );
};
