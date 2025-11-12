import {
  assertFails,
  AssertionError,
  assertTrue,
  deepEquals,
  isErrorConstructor,
  isSubset,
  type Event,
  type ThenThrows,
} from '@event-driven-io/emmett';
import type { Database } from 'firebase-admin/database';
import {
  RealtimeDBDefaultProjectionName,
  type RealtimeDBProjectionDefinition,
  type RealtimeDBReadModel,
} from './realtimeDBProjection';

export type StreamName = string;

export type RealtimeDBProjectionSpecGivenEvents<
  StreamNameType extends StreamName,
  EventType extends Event,
> = {
  streamName: StreamNameType;
  events: EventType[];
};

export type RealtimeDBProjectionHandlerFunction<
  StreamNameType extends StreamName,
  EventType extends Event,
> = (
  streamName: StreamNameType,
  events: EventType[],
  database: Database,
) => Promise<void>;

export type RealtimeDBProjectionSpec<
  StreamNameType extends StreamName,
  EventType extends Event,
> = (
  givenStream: RealtimeDBProjectionSpecGivenEvents<StreamNameType, EventType>,
) => {
  when: (events: EventType[]) => {
    then: (
      assert: RealtimeDBProjectionAssert,
      message?: string,
    ) => Promise<void>;
    thenThrows: <ErrorType extends Error = Error>(
      ...args: Parameters<ThenThrows<ErrorType>>
    ) => Promise<void>;
  };
};

export type RealtimeDBProjectionAssertOptions<
  StreamNameType extends StreamName = StreamName,
> = {
  streamName: StreamNameType;
  database: Database;
};

export type RealtimeDBProjectionAssert<
  StreamNameType extends StreamName = StreamName,
> = (
  options: RealtimeDBProjectionAssertOptions<StreamNameType>,
) => Promise<void | boolean>;

export type RealtimeDBProjectionSpecOptions<
  StreamNameType extends StreamName,
  EventType extends Event,
> = {
  projection: RealtimeDBProjectionDefinition;
  database: Database;
  handler: RealtimeDBProjectionHandlerFunction<StreamNameType, EventType>;
};

export const RealtimeDBProjectionSpec = {
  for: <StreamNameType extends StreamName, EventType extends Event>(
    options: RealtimeDBProjectionSpecOptions<StreamNameType, EventType>,
  ): RealtimeDBProjectionSpec<StreamNameType, EventType> => {
    {
      const { projection, database, handler } = options;

      return (
        givenStream: RealtimeDBProjectionSpecGivenEvents<
          StreamNameType,
          EventType
        >,
      ) => {
        const { streamName, events: givenEvents } = givenStream;
        return {
          when: (events: EventType[]) => {
            const allEvents = [...givenEvents, ...events];

            const run = () => handler(streamName, allEvents, database);

            return {
              then: async (
                assert: RealtimeDBProjectionAssert,
                message?: string,
              ): Promise<void> => {
                try {
                  await run();

                  const succeeded = await assert({ database, streamName });

                  if (succeeded !== undefined && succeeded === false)
                    assertFails(
                      message ??
                        "Projection specification didn't match the criteria",
                    );
                } catch (error) {
                  throw error;
                }
              },
              thenThrows: async <ErrorType extends Error>(
                ...args: Parameters<ThenThrows<ErrorType>>
              ): Promise<void> => {
                try {
                  await run();
                  throw new AssertionError('Handler did not fail as expected');
                } catch (error) {
                  if (error instanceof AssertionError) throw error;

                  if (args.length === 0) return;

                  if (!isErrorConstructor(args[0])) {
                    assertTrue(
                      args[0](error as ErrorType),
                      `Error didn't match the error condition: ${error?.toString()}`,
                    );
                    return;
                  }

                  assertTrue(
                    error instanceof args[0],
                    `Caught error is not an instance of the expected type: ${error?.toString()}`,
                  );

                  if (args[1]) {
                    assertTrue(
                      args[1](error as ErrorType),
                      `Error didn't match the error condition: ${error?.toString()}`,
                    );
                  }
                }
              },
            };
          },
        };
      };
    }
  },
};

export const eventInStream = <
  StreamNameType extends StreamName,
  EventType extends Event,
>(
  streamName: StreamNameType,
  event: EventType,
): RealtimeDBProjectionSpecGivenEvents<StreamNameType, EventType> => ({
  streamName,
  events: [event],
});

export const eventsInStream = <
  StreamNameType extends StreamName,
  EventType extends Event,
>(
  streamName: StreamNameType,
  events: EventType[],
): RealtimeDBProjectionSpecGivenEvents<StreamNameType, EventType> => ({
  streamName,
  events,
});

const expectReadModelToMatch = async <
  Doc extends Record<string, unknown> = Record<string, unknown>,
  StreamNameType extends StreamName = StreamName,
>(
  options: RealtimeDBProjectionAssertOptions<StreamNameType> & {
    projectionName: string;
    match: (readModel: RealtimeDBReadModel<Doc> | null) => boolean;
  },
) => {
  const { streamName, projectionName, database, match } = options;

  const snapshot = await database
    .ref(`streams/${streamName}/projections/${projectionName}`)
    .once('value');

  const readModel = snapshot.val() as RealtimeDBReadModel<Doc> | null;

  return match(readModel);
};

const expectReadModelWithName = (projectionName: string) => ({
  toHave:
    <
      Doc extends Record<string, unknown>,
      StreamNameType extends StreamName = StreamName,
    >(
      expected: Partial<RealtimeDBReadModel<Doc>> | null,
    ): RealtimeDBProjectionAssert<StreamNameType> =>
    ({ database, streamName }) =>
      expectReadModelToMatch<Doc>({
        database,
        streamName,
        projectionName,
        match: (readModel) => isSubset(readModel, expected),
      }),
  toDeepEquals:
    <
      Doc extends Record<string, unknown>,
      StreamNameType extends StreamName = StreamName,
    >(
      expected: RealtimeDBReadModel<Doc> | null,
    ): RealtimeDBProjectionAssert<StreamNameType> =>
    ({ database, streamName }) =>
      expectReadModelToMatch<Doc>({
        database,
        streamName,
        projectionName,
        match: (readModel) => deepEquals(readModel, expected),
      }),
  toMatch:
    <
      Doc extends Record<string, unknown>,
      StreamNameType extends StreamName = StreamName,
    >(
      match: (readModel: RealtimeDBReadModel<Doc> | null) => boolean,
    ): RealtimeDBProjectionAssert<StreamNameType> =>
    ({ database, streamName }) =>
      expectReadModelToMatch<Doc>({
        database,
        streamName,
        projectionName,
        match,
      }),
  notToExist:
    <
      StreamNameType extends StreamName = StreamName,
    >(): RealtimeDBProjectionAssert<StreamNameType> =>
    ({ database, streamName }) =>
      expectReadModelToMatch({
        database,
        streamName,
        projectionName,
        match: (readModel) => readModel === null,
      }),
  toExist:
    (): RealtimeDBProjectionAssert =>
    ({ database, streamName }) =>
      expectReadModelToMatch({
        database,
        streamName,
        projectionName,
        match: (readModel) => readModel !== null,
      }),
});

export const expectReadModel = {
  withName: (name: string) => expectReadModelWithName(name),
  ...expectReadModelWithName(RealtimeDBDefaultProjectionName),
};
