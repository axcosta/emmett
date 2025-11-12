import type { Event, ReadEvent } from '@event-driven-io/emmett';
import type { FirestoreProcessor } from '@event-driven-io/emmett-firestore';
import {
  handleProjections,
  type RealtimeDBProjectionDefinition,
  type RealtimeDBReadEventMetadata,
} from '@event-driven-io/emmett-realtimedb';
import type { Database } from 'firebase-admin/database';

export const createRealtimeDBProcessor = (
  database: Database,
  projections: RealtimeDBProjectionDefinition[],
): FirestoreProcessor => {
  return {
    async handle(events: Event[]): Promise<void> {
      if (events.length === 0) return;

      // Group events by stream
      const eventsByStream = new Map<string, ReadEvent<Event, RealtimeDBReadEventMetadata>[]>();

      for (const event of events) {
        const metadata = event.metadata as { streamName?: string; streamPosition?: bigint };
        const streamName = metadata.streamName;

        if (!streamName) continue;

        const readEvent: ReadEvent<Event, RealtimeDBReadEventMetadata> = {
          type: event.type,
          data: event.data,
          metadata: {
            messageId: (event.metadata as { messageId?: string }).messageId ?? '',
            streamName,
            streamPosition: metadata.streamPosition ?? 0n,
          },
        };

        if (!eventsByStream.has(streamName)) {
          eventsByStream.set(streamName, []);
        }
        eventsByStream.get(streamName)!.push(readEvent);
      }

      // Process each stream
      for (const [streamName, streamEvents] of eventsByStream.entries()) {
        const streamId = streamName;
        const reference = database.ref(`streams/${streamName}`);

        // Read existing projections
        const projectionsSnapshot = await reference.child('projections').once('value');
        const readModels = projectionsSnapshot.val() ?? {};

        // Handle projections
        await handleProjections({
          events: streamEvents,
          projections,
          streamId,
          reference,
          database,
          readModels,
        });
      }
    },
  };
};
