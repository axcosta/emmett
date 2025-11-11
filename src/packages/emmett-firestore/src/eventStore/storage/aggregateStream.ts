/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Firestore } from '@google-cloud/firestore';
import {
  NO_CONCURRENCY_CHECK,
  STREAM_DOES_NOT_EXIST,
  type AggregateStreamOptions,
  type AggregateStreamResult,
  type Event,
} from '@event-driven-io/emmett';
import { readStream } from './readStream';

export const aggregateStream = async <State, EventType extends Event>(
  firestore: Firestore,
  streamName: string,
  options: AggregateStreamOptions<State, EventType>,
  streamsCollectionName: string,
): Promise<AggregateStreamResult<State>> => {
  const { evolve, initialState, read } = options;

  // Read events from stream
  const result = await readStream<EventType>(
    firestore,
    streamName,
    read,
    streamsCollectionName,
  );

  // If stream doesn't exist, return initial state
  if (result.currentStreamVersion === STREAM_DOES_NOT_EXIST) {
    return {
      state: initialState(),
      currentStreamVersion: STREAM_DOES_NOT_EXIST,
    };
  }

  // Aggregate events into state
  const state = result.events.reduce(
    (current, event) => evolve(current, event),
    initialState(),
  );

  return {
    state,
    currentStreamVersion: result.currentStreamVersion,
  };
};
