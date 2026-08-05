/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/state/index.js
 *
 * Purpose:
 * Provides a centralized, observable runtime-state store for
 * TACTIC services, repositories, workflows, and applications.
 *
 * Responsibilities:
 * - Store runtime values under stable state keys
 * - Read, update, and remove state values
 * - Notify exact-key, namespace, and global subscribers
 * - Apply multiple state changes as one batch
 * - Track state revisions and change history
 * - Expose diagnostics and Health information
 *
 * Does NOT:
 * - Replace persistent Settings
 * - Replace repositories as authoritative data sources
 * - Persist runtime state across page reloads
 * - Perform application business logic
 * - Grant capabilities
 *
 * Public API:
 * - set()
 * - get()
 * - has()
 * - update()
 * - remove()
 * - batch()
 * - subscribe()
 * - clear()
 * - snapshot()
 * - getRevision()
 * - getHistory()
 * - clearHistory()
 * - inspect()
 *
 * Subscription patterns:
 * - "wallet.balance" subscribes to one exact key
 * - "wallet.*" subscribes to all keys beginning with "wallet."
 * - "*" subscribes to every state change
 *
 * Dependencies:
 * - core/events.js
 * - core/logger.js
 * - core/errors.js
 * - core/health.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC State] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        events,
        logger,
        errors,
        health,
    } = services;

    const {
        HEALTH_STATES,
    } = constants;

    const SERVICE_NAME =
        "service:state";

    const GLOBAL_PATTERN =
        "*";

    const MAX_HISTORY =
        250;

    const state =
        new Map();

    const revisions =
        new Map();

    const subscribers =
        new Map();

    const history =
        [];

    let globalRevision =
        0;

    let nextSubscriberId =
        1;

    let batchDepth =
        0;

    let pendingNotifications =
        [];

    const metrics = {
        startedAt:
            Date.now(),

        reads:
            0,

        writes:
            0,

        updates:
            0,

        removals:
            0,

        batches:
            0,

        clears:
            0,

        subscriptions:
            0,

        unsubscriptions:
            0,

        notifications:
            0,

        subscriberErrors:
            0,

        historyClears:
            0,

        lastActivityAt:
            Date.now(),

        lastKey:
            null,

        lastOperation:
            null,

        lastRevision:
            0,

        lastError:
            null,
    };

    function isPlainObject(
        value
    ) {
        return (
            value !== null &&
            typeof value ===
                "object" &&
            !Array.isArray(
                value
            )
        );
    }

    function cloneValue(
        value
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            return value;
        }

        if (
            typeof structuredClone ===
            "function"
        ) {
            try {
                return structuredClone(
                    value
                );
            } catch {
                // Fall through.
            }
        }

        if (
            typeof value ===
                "object"
        ) {
            try {
                return JSON.parse(
                    JSON.stringify(
                        value
                    )
                );
            } catch {
                return value;
            }
        }

        return value;
    }

    function valuesEqual(
        first,
        second
    ) {
        if (
            Object.is(
                first,
                second
            )
        ) {
            return true;
        }

        if (
            typeof first !==
                "object" ||
            first === null ||
            typeof second !==
                "object" ||
            second === null
        ) {
            return false;
        }

        try {
            return (
                JSON.stringify(
                    first
                ) ===
                JSON.stringify(
                    second
                )
            );
        } catch {
            return false;
        }
    }

    function normalizeKey(
        key
    ) {
        if (
            typeof key !==
                "string" ||
            !key.trim()
        ) {
            throw new TypeError(
                "State key must be a non-empty string."
            );
        }

        const normalized =
            key
                .trim()
                .toLowerCase();

        if (
            normalized ===
            GLOBAL_PATTERN
        ) {
            return normalized;
        }

        if (
            !/^[a-z0-9:_-]+(?:\.[a-z0-9:_-]+)*$/
                .test(normalized)
        ) {
            throw new TypeError(
                "State key contains unsupported characters."
            );
        }

        return normalized;
    }

    function normalizePattern(
        pattern
    ) {
        if (
            typeof pattern !==
                "string" ||
            !pattern.trim()
        ) {
            throw new TypeError(
                "State subscription pattern must be a non-empty string."
            );
        }

        const normalized =
            pattern
                .trim()
                .toLowerCase();

        if (
            normalized ===
            GLOBAL_PATTERN
        ) {
            return normalized;
        }

        if (
            normalized.endsWith(
                ".*"
            )
        ) {
            const namespace =
                normalized.slice(
                    0,
                    -2
                );

            normalizeKey(
                namespace
            );

            return `${namespace}.*`;
        }

        return normalizeKey(
            normalized
        );
    }

    function getKeyRevision(
        key
    ) {
        return (
            revisions.get(
                key
            ) ||
            0
        );
    }

    function createChange(
        key,
        previousValue,
        value,
        operation,
        options = {}
    ) {
        globalRevision +=
            1;

        const keyRevision =
            getKeyRevision(
                key
            ) + 1;

        revisions.set(
            key,
            keyRevision
        );

        return {
            key,

            operation,

            previousValue:
                cloneValue(
                    previousValue
                ),

            value:
                cloneValue(
                    value
                ),

            revision:
                globalRevision,

            keyRevision,

            source:
                typeof options.source ===
                    "string" &&
                options.source.trim()
                    ? options.source.trim()
                    : "unknown",

            metadata:
                isPlainObject(
                    options.metadata
                )
                    ? {
                          ...options.metadata,
                      }
                    : {},

            timestamp:
                Date.now(),
        };
    }

    function createChangeSnapshot(
        change
    ) {
        if (!change) {
            return null;
        }

        return {
            key:
                change.key,

            operation:
                change.operation,

            previousValue:
                cloneValue(
                    change.previousValue
                ),

            value:
                cloneValue(
                    change.value
                ),

            revision:
                change.revision,

            keyRevision:
                change.keyRevision,

            source:
                change.source,

            metadata: {
                ...change.metadata,
            },

            timestamp:
                change.timestamp,
        };
    }

    function trimHistory() {
        if (
            history.length <=
            MAX_HISTORY
        ) {
            return;
        }

        history.splice(
            0,
            history.length -
                MAX_HISTORY
        );
    }

    function addToHistory(
        change
    ) {
        history.push(
            change
        );

        trimHistory();
    }

    function patternMatches(
        pattern,
        key
    ) {
        if (
            pattern ===
            GLOBAL_PATTERN
        ) {
            return true;
        }

        if (
            pattern.endsWith(
                ".*"
            )
        ) {
            const prefix =
                pattern.slice(
                    0,
                    -1
                );

            return key.startsWith(
                prefix
            );
        }

        return pattern === key;
    }

    function recordActivity(
        operation,
        key = null,
        metadata = {}
    ) {
        metrics.lastActivityAt =
            Date.now();

        metrics.lastOperation =
            operation;

        metrics.lastKey =
            key;

        metrics.lastRevision =
            globalRevision;

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    lastKey:
                        key,

                    globalRevision,

                    stateKeyCount:
                        state.size,

                    subscriberCount:
                        subscribers.size,

                    historyCount:
                        history.length,

                    ...metadata,
                },
            }
        );
    }

    function emitChange(
        change
    ) {
        events?.emit(
            "state:changed",
            {
                change:
                    createChangeSnapshot(
                        change
                    ),
            }
        );

        events?.emit(
            `state:changed:${change.key}`,
            {
                change:
                    createChangeSnapshot(
                        change
                    ),
            }
        );
    }

    async function notifySubscriber(
        subscriber,
        change
    ) {
        try {
            await subscriber.callback({
                change:
                    createChangeSnapshot(
                        change
                    ),

                key:
                    change.key,

                value:
                    cloneValue(
                        change.value
                    ),

                previousValue:
                    cloneValue(
                        change.previousValue
                    ),

                operation:
                    change.operation,

                revision:
                    change.revision,

                keyRevision:
                    change.keyRevision,

                source:
                    change.source,

                metadata: {
                    ...change.metadata,
                },
            });

            metrics.notifications +=
                1;
        } catch (error) {
            metrics.subscriberErrors +=
                1;

            metrics.lastError = {
                name:
                    error?.name ||
                    "Error",

                message:
                    error?.message ||
                    String(error),

                subscriberId:
                    subscriber.id,

                pattern:
                    subscriber.pattern,

                timestamp:
                    Date.now(),
            };

            logger?.warn(
                "State subscriber callback failed",
                {
                    subscriberId:
                        subscriber.id,

                    pattern:
                        subscriber.pattern,

                    key:
                        change.key,

                    error,
                }
            );

            errors?.report({
                code:
                    TACTIC.ERROR_CODES
                        ?.GENERAL
                        ?.INTERNAL ||
                    "INTERNAL",

                severity:
                    TACTIC.SEVERITY
                        ?.WARNING ||
                    "warning",

                service:
                    "state",

                message:
                    `State subscriber failed for "${subscriber.pattern}".`,

                details: {
                    subscriberId:
                        subscriber.id,

                    pattern:
                        subscriber.pattern,

                    stateKey:
                        change.key,
                },

                error,

                recoverable:
                    true,

                retryable:
                    false,

                recovery:
                    "Review the state subscriber callback.",
            });
        }
    }

    function dispatchChange(
        change
    ) {
        if (
            batchDepth > 0
        ) {
            pendingNotifications.push(
                change
            );

            return;
        }

        emitChange(
            change
        );

        for (
            const subscriber of
            subscribers.values()
        ) {
            if (
                patternMatches(
                    subscriber.pattern,
                    change.key
                )
            ) {
                void notifySubscriber(
                    subscriber,
                    change
                );
            }
        }
    }

    function flushPendingNotifications() {
        if (
            pendingNotifications.length ===
            0
        ) {
            return;
        }

        const changes =
            pendingNotifications;

        pendingNotifications =
            [];

        events?.emit(
            "state:batch-changed",
            {
                changes:
                    changes.map(
                        createChangeSnapshot
                    ),

                revision:
                    globalRevision,

                timestamp:
                    Date.now(),
            }
        );

        for (
            const change of
            changes
        ) {
            emitChange(
                change
            );

            for (
                const subscriber of
                subscribers.values()
            ) {
                if (
                    patternMatches(
                        subscriber.pattern,
                        change.key
                    )
                ) {
                    void notifySubscriber(
                        subscriber,
                        change
                    );
                }
            }
        }
    }

    function get(
        key,
        fallback = null
    ) {
        metrics.reads +=
            1;

        const normalizedKey =
            normalizeKey(
                key
            );

        recordActivity(
            "get",
            normalizedKey
        );

        if (
            !state.has(
                normalizedKey
            )
        ) {
            return cloneValue(
                fallback
            );
        }

        return cloneValue(
            state.get(
                normalizedKey
            )
        );
    }

    function has(
        key
    ) {
        try {
            return state.has(
                normalizeKey(
                    key
                )
            );
        } catch {
            return false;
        }
    }

    function set(
        key,
        value,
        options = {}
    ) {
        const normalizedKey =
            normalizeKey(
                key
            );

        const previousValue =
            state.has(
                normalizedKey
            )
                ? state.get(
                      normalizedKey
                  )
                : undefined;

        if (
            options.force !==
                true &&
            state.has(
                normalizedKey
            ) &&
            valuesEqual(
                previousValue,
                value
            )
        ) {
            return {
                changed:
                    false,

                key:
                    normalizedKey,

                value:
                    cloneValue(
                        previousValue
                    ),

                revision:
                    globalRevision,

                keyRevision:
                    getKeyRevision(
                        normalizedKey
                    ),
            };
        }

        const storedValue =
            cloneValue(
                value
            );

        state.set(
            normalizedKey,
            storedValue
        );

        metrics.writes +=
            1;

        const change =
            createChange(
                normalizedKey,
                previousValue,
                storedValue,
                "set",
                options
            );

        addToHistory(
            change
        );

        recordActivity(
            "set",
            normalizedKey
        );

        dispatchChange(
            change
        );

        return {
            changed:
                true,

            key:
                normalizedKey,

            value:
                cloneValue(
                    storedValue
                ),

            revision:
                change.revision,

            keyRevision:
                change.keyRevision,

            change:
                createChangeSnapshot(
                    change
                ),
        };
    }

    function update(
        key,
        updater,
        options = {}
    ) {
        if (
            typeof updater !==
                "function"
        ) {
            throw new TypeError(
                "State updater must be a function."
            );
        }

        const normalizedKey =
            normalizeKey(
                key
            );

        const currentValue =
            get(
                normalizedKey,
                options.fallback
            );

        const nextValue =
            updater(
                cloneValue(
                    currentValue
                )
            );

        metrics.updates +=
            1;

        return set(
            normalizedKey,
            nextValue,
            {
                ...options,

                source:
                    options.source ||
                    "state.update",
            }
        );
    }

    function remove(
        key,
        options = {}
    ) {
        const normalizedKey =
            normalizeKey(
                key
            );

        if (
            !state.has(
                normalizedKey
            )
        ) {
            return false;
        }

        const previousValue =
            state.get(
                normalizedKey
            );

        state.delete(
            normalizedKey
        );

        metrics.removals +=
            1;

        const change =
            createChange(
                normalizedKey,
                previousValue,
                undefined,
                "remove",
                options
            );

        addToHistory(
            change
        );

        recordActivity(
            "remove",
            normalizedKey
        );

        dispatchChange(
            change
        );

        return true;
    }

    function normalizeBatchEntry(
        entry
    ) {
        if (
            Array.isArray(
                entry
            ) &&
            entry.length >= 2
        ) {
            return {
                key:
                    entry[0],

                value:
                    entry[1],
            };
        }

        if (
            isPlainObject(
                entry
            ) &&
            typeof entry.key ===
                "string"
        ) {
            return {
                key:
                    entry.key,

                value:
                    entry.value,

                remove:
                    entry.remove ===
                    true,

                force:
                    entry.force ===
                    true,

                metadata:
                    isPlainObject(
                        entry.metadata
                    )
                        ? {
                              ...entry.metadata,
                          }
                        : {},
            };
        }

        throw new TypeError(
            "Each state batch entry must be [key, value] or an object containing key."
        );
    }

    function batch(
        entries,
        options = {}
    ) {
        let normalizedEntries;

        if (
            Array.isArray(
                entries
            )
        ) {
            normalizedEntries =
                entries.map(
                    normalizeBatchEntry
                );
        } else if (
            isPlainObject(
                entries
            )
        ) {
            normalizedEntries =
                Object.entries(
                    entries
                ).map(
                    ([
                        key,
                        value,
                    ]) => ({
                        key,
                        value,
                    })
                );
        } else {
            throw new TypeError(
                "State batch must be an array or plain object."
            );
        }

        metrics.batches +=
            1;

        batchDepth +=
            1;

        const results =
            [];

        try {
            for (
                const entry of
                normalizedEntries
            ) {
                if (
                    entry.remove
                ) {
                    results.push({
                        key:
                            normalizeKey(
                                entry.key
                            ),

                        removed:
                            remove(
                                entry.key,
                                {
                                    source:
                                        options.source ||
                                        "state.batch",

                                    metadata: {
                                        ...(isPlainObject(
                                            options.metadata
                                        )
                                            ? options.metadata
                                            : {}),

                                        ...entry.metadata,
                                    },
                                }
                            ),
                    });

                    continue;
                }

                results.push(
                    set(
                        entry.key,
                        entry.value,
                        {
                            source:
                                options.source ||
                                "state.batch",

                            force:
                                entry.force,

                            metadata: {
                                ...(isPlainObject(
                                    options.metadata
                                )
                                    ? options.metadata
                                    : {}),

                                ...entry.metadata,
                            },
                        }
                    )
                );
            }
        } finally {
            batchDepth -=
                1;

            if (
                batchDepth ===
                0
            ) {
                flushPendingNotifications();
            }
        }

        recordActivity(
            "batch",
            null,
            {
                entryCount:
                    normalizedEntries
                        .length,
            }
        );

        return {
            entryCount:
                normalizedEntries.length,

            changedCount:
                results.filter(
                    (result) =>
                        result.changed ===
                            true ||
                        result.removed ===
                            true
                ).length,

            revision:
                globalRevision,

            results,
        };
    }

    function subscribe(
        pattern,
        callback,
        options = {}
    ) {
        if (
            typeof callback !==
                "function"
        ) {
            throw new TypeError(
                "State subscriber must be a function."
            );
        }

        const normalizedPattern =
            normalizePattern(
                pattern
            );

        const subscriber = {
            id:
                nextSubscriberId++,

            pattern:
                normalizedPattern,

            callback,

            createdAt:
                Date.now(),

            metadata:
                isPlainObject(
                    options.metadata
                )
                    ? {
                          ...options.metadata,
                      }
                    : {},
        };

        subscribers.set(
            subscriber.id,
            subscriber
        );

        metrics.subscriptions +=
            1;

        recordActivity(
            "subscribe",
            normalizedPattern,
            {
                subscriberId:
                    subscriber.id,
            }
        );

        if (
            options.emitInitial ===
            true
        ) {
            if (
                normalizedPattern ===
                GLOBAL_PATTERN ||
                normalizedPattern.endsWith(
                    ".*"
                )
            ) {
                const initialSnapshot =
                    snapshot(
                        normalizedPattern ===
                            GLOBAL_PATTERN
                            ? null
                            : normalizedPattern.slice(
                                  0,
                                  -2
                              )
                    );

                queueMicrotask(
                    () => {
                        try {
                            callback({
                                initial:
                                    true,

                                pattern:
                                    normalizedPattern,

                                snapshot:
                                    initialSnapshot,

                                revision:
                                    globalRevision,
                            });
                        } catch (error) {
                            logger?.warn(
                                "Initial state subscriber callback failed",
                                {
                                    subscriberId:
                                        subscriber.id,

                                    pattern:
                                        normalizedPattern,

                                    error,
                                }
                            );
                        }
                    }
                );
            } else {
                const exists =
                    state.has(
                        normalizedPattern
                    );

                const initialValue =
                    exists
                        ? cloneValue(
                              state.get(
                                  normalizedPattern
                              )
                          )
                        : cloneValue(
                              options.fallback
                          );

                queueMicrotask(
                    () => {
                        try {
                            callback({
                                initial:
                                    true,

                                key:
                                    normalizedPattern,

                                value:
                                    initialValue,

                                previousValue:
                                    undefined,

                                operation:
                                    "initial",

                                revision:
                                    globalRevision,

                                keyRevision:
                                    getKeyRevision(
                                        normalizedPattern
                                    ),

                                source:
                                    "state.subscribe",

                                metadata:
                                    {},
                            });
                        } catch (error) {
                            logger?.warn(
                                "Initial state subscriber callback failed",
                                {
                                    subscriberId:
                                        subscriber.id,

                                    pattern:
                                        normalizedPattern,

                                    error,
                                }
                            );
                        }
                    }
                );
            }
        }

        let active =
            true;

        return function unsubscribe() {
            if (!active) {
                return false;
            }

            active =
                false;

            const removed =
                subscribers.delete(
                    subscriber.id
                );

            if (removed) {
                metrics.unsubscriptions +=
                    1;

                recordActivity(
                    "unsubscribe",
                    normalizedPattern,
                    {
                        subscriberId:
                            subscriber.id,
                    }
                );
            }

            return removed;
        };
    }

    function clear(
        prefix = null,
        options = {}
    ) {
        const keys =
            prefix === null ||
            prefix === undefined
                ? [
                      ...state.keys(),
                  ]
                : [
                      ...state.keys(),
                  ].filter(
                      (key) => {
                          const normalizedPrefix =
                              normalizeKey(
                                  prefix
                              );

                          return (
                              key ===
                                  normalizedPrefix ||
                              key.startsWith(
                                  `${normalizedPrefix}.`
                              )
                          );
                      }
                  );

        if (
            keys.length ===
            0
        ) {
            return 0;
        }

        metrics.clears +=
            1;

        batchDepth +=
            1;

        try {
            for (
                const key of
                keys
            ) {
                remove(
                    key,
                    {
                        source:
                            options.source ||
                            "state.clear",

                        metadata:
                            isPlainObject(
                                options.metadata
                            )
                                ? options.metadata
                                : {},
                    }
                );
            }
        } finally {
            batchDepth -=
                1;

            if (
                batchDepth ===
                0
            ) {
                flushPendingNotifications();
            }
        }

        recordActivity(
            "clear",
            prefix
        );

        return keys.length;
    }

    function snapshot(
        prefix = null
    ) {
        const output =
            {};

        let normalizedPrefix =
            null;

        if (
            prefix !== null &&
            prefix !== undefined
        ) {
            normalizedPrefix =
                normalizeKey(
                    prefix
                );
        }

        for (
            const [
                key,
                value,
            ] of state.entries()
        ) {
            if (
                normalizedPrefix &&
                key !==
                    normalizedPrefix &&
                !key.startsWith(
                    `${normalizedPrefix}.`
                )
            ) {
                continue;
            }

            output[key] =
                cloneValue(
                    value
                );
        }

        return output;
    }

    function getRevision(
        key = null
    ) {
        if (
            key === null ||
            key === undefined
        ) {
            return globalRevision;
        }

        return getKeyRevision(
            normalizeKey(
                key
            )
        );
    }

    function getHistory(
        filters = {}
    ) {
        let results = [
            ...history,
        ];

        if (filters.key) {
            const key =
                normalizeKey(
                    filters.key
                );

            results =
                results.filter(
                    (change) =>
                        change.key === key
                );
        }

        if (filters.prefix) {
            const prefix =
                normalizeKey(
                    filters.prefix
                );

            results =
                results.filter(
                    (change) =>
                        change.key ===
                            prefix ||
                        change.key.startsWith(
                            `${prefix}.`
                        )
                );
        }

        if (filters.operation) {
            results =
                results.filter(
                    (change) =>
                        change.operation ===
                        filters.operation
                );
        }

        if (
            Number.isSafeInteger(
                filters.limit
            ) &&
            filters.limit > 0
        ) {
            results =
                results.slice(
                    -filters.limit
                );
        }

        return results.map(
            createChangeSnapshot
        );
    }

    function clearHistory() {
        const removed =
            history.length;

        history.splice(
            0,
            history.length
        );

        metrics.historyClears +=
            1;

        recordActivity(
            "history-cleared"
        );

        return removed;
    }

    function inspect() {
        const subscriberPatterns =
            {};

        for (
            const subscriber of
            subscribers.values()
        ) {
            subscriberPatterns[
                subscriber.pattern
            ] =
                (
                    subscriberPatterns[
                        subscriber.pattern
                    ] ||
                    0
                ) + 1;
        }

        return {
            service:
                "state",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            persistent:
                false,

            globalRevision,

            stateKeyCount:
                state.size,

            subscriberCount:
                subscribers.size,

            historyCount:
                history.length,

            keys: [
                ...state.keys(),
            ].sort(),

            snapshot:
                snapshot(),

            revisions:
                Object.fromEntries(
                    [
                        ...revisions.entries(),
                    ].sort(
                        (
                            first,
                            second
                        ) =>
                            first[0].localeCompare(
                                second[0]
                            )
                    )
                ),

            subscriberPatterns,

            metrics: {
                ...metrics,

                lastError:
                    metrics.lastError
                        ? {
                              ...metrics
                                  .lastError,
                          }
                        : null,
            },

            defaults: {
                maximumHistory:
                    MAX_HISTORY,
            },
        };
    }

    TACTIC.services.state =
        Object.freeze({
            set,
            get,
            has,
            update,
            remove,
            batch,
            subscribe,
            clear,

            snapshot,
            getRevision,

            getHistory,
            clearHistory,

            inspect,
        });

    health?.register({
        name:
            SERVICE_NAME,

        type:
            health.types.SERVICE,

        status:
            HEALTH_STATES.HEALTHY,

        staleAfterMs:
            null,

        metadata: {
            serviceName:
                "state",

            persistent:
                false,

            stateKeyCount:
                0,

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "State service loaded",
        {
            persistent:
                false,
        }
    );
})();