/* 
eslint-disable @typescript-eslint/no-explicit-any, 
@typescript-eslint/no-unsafe-assignment, 
@typescript-eslint/no-unsafe-call, 
@typescript-eslint/no-unsafe-member-access
 */
import {
  STREAM_DOES_NOT_EXIST,
  type AggregateStreamOptions,
  type AggregateStreamResult,
  type Event,
} from '@event-driven-io/emmett';
import type { Firestore } from '@google-cloud/firestore';
import { readStream } from './readStream';

const aggregateStreamImpl = async <State, EventType extends Event>(
  firestore: Firestore,
  streamName: string,
  options: AggregateStreamOptions<State, EventType, any>,
  streamsCollectionName: string,
): Promise<AggregateStreamResult<State>> => {
  const evolve = (options as any).evolve;
  const initialState = (options as any).initialState;
  const read = (options as any).read;

  const result = await readStream<EventType>(
    firestore,
    streamName,
    read,
    streamsCollectionName,
  );

  const streamDoesNotExist = STREAM_DOES_NOT_EXIST as unknown as bigint;
  const currentVersion = result.currentStreamVersion;

  if (currentVersion === streamDoesNotExist) {
    return {
      state: initialState(),
      currentStreamVersion: streamDoesNotExist,
      streamExists: false,
    };
  }

  let state = initialState();
  for (const event of result.events) {
    state = evolve(state, event);
  }

  return {
    state,
    currentStreamVersion: result.currentStreamVersion,
    streamExists: true,
  };
};

export const aggregateStream = aggregateStreamImpl;
