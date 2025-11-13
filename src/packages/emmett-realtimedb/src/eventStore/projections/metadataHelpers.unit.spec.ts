/* eslint-disable @typescript-eslint/no-unused-vars */
import { assertDeepEqual, type Event } from '@event-driven-io/emmett';
import { describe, it } from 'node:test';
import {
  extractFromEvent,
  toRealtimeDBMetadata,
  toRealtimeDBMetadataBatch,
} from './metadataHelpers';
import type { RealtimeDBReadEventMetadata } from './realtimeDBProjection';

type TestEvent = Event<'TestEvent', { value: string }>;

void describe('Metadata Helpers', () => {
  void describe('toRealtimeDBMetadata', () => {
    void it('should convert metadata with bigint streamPosition', () => {
      const event = {
        type: 'TestEvent' as const,
        data: { value: 'test' },
        metadata: {
          messageId: 'msg-123',
          streamName: 'test-stream',
          streamPosition: 42n,
          extraField: 'ignored',
        },
      };

      const result = toRealtimeDBMetadata(event);

      assertDeepEqual(result, {
        type: 'TestEvent',
        data: { value: 'test' },
        metadata: {
          messageId: 'msg-123',
          streamName: 'test-stream',
          streamPosition: 42n,
        },
      });
    });

    void it('should convert metadata with number streamPosition', () => {
      const event = {
        type: 'TestEvent' as const,
        data: { value: 'test' },
        metadata: {
          messageId: 'msg-456',
          streamName: 'test-stream-2',
          streamPosition: 99,
        },
      };

      const result = toRealtimeDBMetadata(event);

      assertDeepEqual(result.metadata.streamPosition, 99n);
    });

    void it('should convert metadata with string streamPosition', () => {
      const event = {
        type: 'TestEvent' as const,
        data: { value: 'test' },
        metadata: {
          messageId: 'msg-789',
          streamName: 'test-stream-3',
          streamPosition: '123',
        },
      };

      const result = toRealtimeDBMetadata(event);

      assertDeepEqual(result.metadata.streamPosition, 123n);
    });

    void it('should use default values for missing fields', () => {
      const event = {
        type: 'TestEvent' as const,
        data: { value: 'test' },
        metadata: {},
      };

      const result = toRealtimeDBMetadata(event);

      assertDeepEqual(result, {
        type: 'TestEvent',
        data: { value: 'test' },
        metadata: {
          messageId: undefined,
          streamName: '',
          streamPosition: 0n,
        },
      });
    });

    void it('should merge custom metadata', () => {
      const event = {
        type: 'TestEvent' as const,
        data: { value: 'test' },
        metadata: {
          messageId: 'msg-custom',
          streamName: 'custom-stream',
          streamPosition: 10n,
        },
      };

      const result = toRealtimeDBMetadata(event, {
        clientId: 'client-123',
        userId: 'user-456',
      });

      assertDeepEqual(result, {
        type: 'TestEvent',
        data: { value: 'test' },
        metadata: {
          messageId: 'msg-custom',
          streamName: 'custom-stream',
          streamPosition: 10n,
          clientId: 'client-123',
          userId: 'user-456',
        },
      });
    });
  });

  void describe('extractFromEvent', () => {
    void it('should extract field from metadata by default', () => {
      const event = {
        type: 'TestEvent' as const,
        data: { value: 'test' },
        metadata: {
          clientId: 'client-123',
          streamName: 'test-stream',
        },
      };

      const result = extractFromEvent(event, 'clientId');

      assertDeepEqual(result, 'client-123');
    });

    void it('should extract field from data when specified', () => {
      const event = {
        type: 'TestEvent' as const,
        data: {
          value: 'test',
          customerId: 'customer-456',
        },
        metadata: {
          streamName: 'test-stream',
        },
      };

      const result = extractFromEvent(event, 'customerId', 'data');

      assertDeepEqual(result, 'customer-456');
    });

    void it('should return undefined for missing field', () => {
      const event = {
        type: 'TestEvent' as const,
        data: { value: 'test' },
        metadata: { streamName: 'test-stream' },
      };

      const result = extractFromEvent(event, 'nonexistent');

      assertDeepEqual(result, undefined);
    });

    void it('should handle typed extraction', () => {
      const event = {
        type: 'TestEvent' as const,
        data: { count: 42 },
        metadata: { streamName: 'test-stream' },
      };

      const result = extractFromEvent<number>(event, 'count', 'data');

      assertDeepEqual(result, 42);
    });
  });

  void describe('toRealtimeDBMetadataBatch', () => {
    void it('should convert batch of events', () => {
      const events = [
        {
          type: 'TestEvent' as const,
          data: { value: 'test1' },
          metadata: {
            messageId: 'msg-1',
            streamName: 'stream-1',
            streamPosition: 1n,
          },
        },
        {
          type: 'TestEvent' as const,
          data: { value: 'test2' },
          metadata: {
            messageId: 'msg-2',
            streamName: 'stream-2',
            streamPosition: 2n,
          },
        },
      ];

      const result = toRealtimeDBMetadataBatch(events);

      assertDeepEqual(result.length, 2);
      assertDeepEqual(result[0]!.metadata.messageId, 'msg-1');
      assertDeepEqual(result[1]!.metadata.messageId, 'msg-2');
    });

    void it('should apply custom metadata function to each event', () => {
      const events = [
        {
          type: 'TestEvent' as const,
          data: { value: 'test1', customerId: 'c1' },
          metadata: {
            messageId: 'msg-1',
            streamName: 'stream-1',
            streamPosition: 1n,
          },
        },
        {
          type: 'TestEvent' as const,
          data: { value: 'test2', customerId: 'c2' },
          metadata: {
            messageId: 'msg-2',
            streamName: 'stream-2',
            streamPosition: 2n,
          },
        },
      ];

      const result = toRealtimeDBMetadataBatch(events, (event) => ({
        clientId: extractFromEvent(event, 'customerId', 'data') as string,
      }));

      assertDeepEqual(result.length, 2);
      assertDeepEqual(
        (
          result[0]!.metadata as RealtimeDBReadEventMetadata & {
            clientId: string;
          }
        ).clientId,
        'c1',
      );
      assertDeepEqual(
        (
          result[1]!.metadata as RealtimeDBReadEventMetadata & {
            clientId: string;
          }
        ).clientId,
        'c2',
      );
    });

    void it('should handle empty batch', () => {
      const events: typeof Array<{
        type: 'TestEvent';
        data: { value: string };
        metadata: Record<string, unknown>;
      }> = [];

      const result = toRealtimeDBMetadataBatch(events);

      assertDeepEqual(result.length, 0);
    });
  });
});
