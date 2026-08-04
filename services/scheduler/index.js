/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/scheduler/index.js
 *
 * Purpose:
 * Provides centralized timer scheduling, inspection,
 * cancellation, pausing, and resuming.
 *
 * Responsibilities:
 * - Create named one-time timers
 * - Create named recurring timers
 * - Prevent duplicate timer names
 * - Track timer execution and drift
 * - Pause and resume timers
 * - Cancel individual or grouped timers
 * - Expose safe diagnostic snapshots
 *
 * Does NOT:
 * - Contain module business logic
 * - Perform DOM operations
 * - Make API requests
 *
 * Public API:
 * - once()
 * - every()
 * - cancel()
 * - cancelGroup()
 * - cancelAll()
 * - pause()
 * - resume()
 * - pauseGroup()
 * - resumeGroup()
 * - has()
 * - get()
 * - inspect()
 * - count()
 *
 * Dependencies:
 * - core/constants.js
 * - core/events.js
 * - core/logger.js
 * - core/errors.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Scheduler] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        logger,
        events,
        errors,
    } = services;

    const {
        ERROR_CODES,
        SEVERITY,
    } = constants;

    const TIMER_TYPES =
        Object.freeze({
            ONCE: "once",
            REPEATING: "repeating",
        });

    const TIMER_STATES =
        Object.freeze({
            SCHEDULED: "scheduled",
            RUNNING: "running",
            PAUSED: "paused",
            COMPLETED: "completed",
            CANCELLED: "cancelled",
            ERROR: "error",
        });

    const timers =
        new Map();

    function validateName(name) {
        if (
            typeof name !== "string" ||
            !name.trim()
        ) {
            throw new TypeError(
                "Scheduler timer name must be a non-empty string."
            );
        }

        return name.trim();
    }

    function validateDelay(
        delayMs
    ) {
        if (
            !Number.isFinite(delayMs) ||
            delayMs < 0
        ) {
            throw new TypeError(
                "Scheduler delay must be a non-negative number."
            );
        }

        return Math.floor(
            delayMs
        );
    }

    function validateCallback(
        callback
    ) {
        if (
            typeof callback !==
            "function"
        ) {
            throw new TypeError(
                "Scheduler callback must be a function."
            );
        }

        return callback;
    }

    function normalizeOptions(
        options = {}
    ) {
        return {
            group:
                typeof options.group ===
                    "string" &&
                options.group.trim()
                    ? options.group.trim()
                    : "default",

            runImmediately:
                Boolean(
                    options.runImmediately
                ),

            replaceExisting:
                Boolean(
                    options.replaceExisting
                ),

            continueOnError:
                options.continueOnError !==
                false,

            metadata:
                options.metadata &&
                typeof options.metadata ===
                    "object" &&
                !Array.isArray(
                    options.metadata
                )
                    ? {
                          ...options.metadata,
                      }
                    : {},
        };
    }

    function createTimerRecord({
        name,
        type,
        delayMs,
        callback,
        options,
    }) {
        const now =
            Date.now();

        return {
            name,
            type,

            group:
                options.group,

            delayMs,
            callback,

            state:
                TIMER_STATES.SCHEDULED,

            handle:
                null,

            createdAt:
                now,

            scheduledAt:
                now,

            nextRunAt:
                now + delayMs,

            lastRunAt:
                null,

            lastCompletedAt:
                null,

            executionCount:
                0,

            errorCount:
                0,

            lastError:
                null,

            lastDriftMs:
                null,

            totalDriftMs:
                0,

            pausedAt:
                null,

            remainingMs:
                null,

            continueOnError:
                options.continueOnError,

            metadata:
                options.metadata,
        };
    }

    function createPublicSnapshot(
        timer
    ) {
        if (!timer) {
            return null;
        }

        const now =
            Date.now();

        return {
            name:
                timer.name,

            type:
                timer.type,

            group:
                timer.group,

            delayMs:
                timer.delayMs,

            state:
                timer.state,

            createdAt:
                timer.createdAt,

            scheduledAt:
                timer.scheduledAt,

            nextRunAt:
                timer.nextRunAt,

            millisecondsUntilNextRun:
                timer.nextRunAt === null
                    ? null
                    : Math.max(
                          0,
                          timer.nextRunAt -
                              now
                      ),

            lastRunAt:
                timer.lastRunAt,

            lastCompletedAt:
                timer.lastCompletedAt,

            executionCount:
                timer.executionCount,

            errorCount:
                timer.errorCount,

            lastError:
                timer.lastError,

            lastDriftMs:
                timer.lastDriftMs,

            averageDriftMs:
                timer.executionCount > 0
                    ? timer.totalDriftMs /
                      timer.executionCount
                    : 0,

            pausedAt:
                timer.pausedAt,

            remainingMs:
                timer.remainingMs,

            continueOnError:
                timer.continueOnError,

            metadata: {
                ...timer.metadata,
            },
        };
    }

    function reportSchedulerError(
        timer,
        error
    ) {
        timer.errorCount += 1;

        timer.lastError = {
            name:
                error?.name ||
                "Error",

            message:
                error?.message ||
                String(error),

            timestamp:
                Date.now(),
        };

        errors?.report({
            code:
                ERROR_CODES
                    .GENERAL
                    .INTERNAL,

            severity:
                SEVERITY.ERROR,

            service:
                "scheduler",

            message:
                `Scheduled task "${timer.name}" failed.`,

            details: {
                timer:
                    timer.name,

                type:
                    timer.type,

                group:
                    timer.group,

                executionCount:
                    timer.executionCount,
            },

            error:
                error instanceof Error
                    ? error
                    : new Error(
                          String(error)
                      ),

            recoverable:
                timer.continueOnError,

            retryable:
                timer.type ===
                TIMER_TYPES.REPEATING,

            recovery:
                timer.continueOnError
                    ? "The scheduler will continue according to the timer configuration."
                    : "The timer was stopped after the error.",
        });
    }

    async function executeTimer(
        timer
    ) {
        if (
            !timer ||
            timer.state ===
                TIMER_STATES.CANCELLED ||
            timer.state ===
                TIMER_STATES.PAUSED
        ) {
            return;
        }

        const expectedRunAt =
            timer.nextRunAt;

        const startedAt =
            Date.now();

        timer.state =
            TIMER_STATES.RUNNING;

        timer.lastRunAt =
            startedAt;

        timer.executionCount +=
            1;

        const driftMs =
            expectedRunAt === null
                ? 0
                : Math.max(
                      0,
                      startedAt -
                          expectedRunAt
                  );

        timer.lastDriftMs =
            driftMs;

        timer.totalDriftMs +=
            driftMs;

        events?.emit(
            "scheduler:task-started",
            {
                timer:
                    createPublicSnapshot(
                        timer
                    ),
            }
        );

        try {
            await timer.callback({
                name:
                    timer.name,

                group:
                    timer.group,

                type:
                    timer.type,

                executionCount:
                    timer.executionCount,

                driftMs,

                scheduler:
                    TACTIC.services
                        .scheduler,
            });

            timer.lastCompletedAt =
                Date.now();

            events?.emit(
                "scheduler:task-completed",
                {
                    timer:
                        createPublicSnapshot(
                            timer
                        ),
                }
            );
        } catch (error) {
            timer.state =
                TIMER_STATES.ERROR;

            reportSchedulerError(
                timer,
                error
            );

            events?.emit(
                "scheduler:task-failed",
                {
                    timer:
                        createPublicSnapshot(
                            timer
                        ),

                    error,
                }
            );

            if (
                !timer.continueOnError
            ) {
                cancel(
                    timer.name
                );

                return;
            }
        }

        if (
            timer.type ===
            TIMER_TYPES.ONCE
        ) {
            timer.state =
                TIMER_STATES.COMPLETED;

            timer.nextRunAt =
                null;

            timer.handle =
                null;

            events?.emit(
                "scheduler:task-finished",
                {
                    timer:
                        createPublicSnapshot(
                            timer
                        ),
                }
            );

            return;
        }

        if (
            timer.state !==
                TIMER_STATES.CANCELLED &&
            timer.state !==
                TIMER_STATES.PAUSED
        ) {
            scheduleRepeatingTimer(
                timer
            );
        }
    }

    function scheduleOnceTimer(
        timer,
        delayOverride = null
    ) {
        const delay =
            delayOverride === null
                ? timer.delayMs
                : Math.max(
                      0,
                      delayOverride
                  );

        timer.scheduledAt =
            Date.now();

        timer.nextRunAt =
            timer.scheduledAt +
            delay;

        timer.state =
            TIMER_STATES.SCHEDULED;

        timer.handle =
            setTimeout(
                () => {
                    timer.handle =
                        null;

                    executeTimer(
                        timer
                    );
                },
                delay
            );
    }

    function scheduleRepeatingTimer(
        timer,
        delayOverride = null
    ) {
        const delay =
            delayOverride === null
                ? timer.delayMs
                : Math.max(
                      0,
                      delayOverride
                  );

        timer.scheduledAt =
            Date.now();

        timer.nextRunAt =
            timer.scheduledAt +
            delay;

        /*
         * Restores resumed and recurring timers to SCHEDULED.
         *
         * Without this assignment, a timer resumed from PAUSED
         * keeps the PAUSED state and executeTimer() refuses to
         * execute it when the new timeout fires.
         */
        timer.state =
            TIMER_STATES.SCHEDULED;

        timer.handle =
            setTimeout(
                () => {
                    timer.handle =
                        null;

                    executeTimer(
                        timer
                    );
                },
                delay
            );
    }

    function prepareTimer({
        name,
        type,
        delayMs,
        callback,
        options,
    }) {
        const normalizedName =
            validateName(name);

        const normalizedDelay =
            validateDelay(delayMs);

        const normalizedCallback =
            validateCallback(
                callback
            );

        const normalizedOptions =
            normalizeOptions(
                options
            );

        if (
            timers.has(
                normalizedName
            )
        ) {
            if (
                !normalizedOptions
                    .replaceExisting
            ) {
                throw new Error(
                    `Scheduler timer "${normalizedName}" already exists.`
                );
            }

            cancel(
                normalizedName
            );
        }

        const timer =
            createTimerRecord({
                name:
                    normalizedName,

                type,

                delayMs:
                    normalizedDelay,

                callback:
                    normalizedCallback,

                options:
                    normalizedOptions,
            });

        timers.set(
            normalizedName,
            timer
        );

        events?.emit(
            "scheduler:task-created",
            {
                timer:
                    createPublicSnapshot(
                        timer
                    ),
            }
        );

        return {
            timer,

            options:
                normalizedOptions,
        };
    }

    function once(
        name,
        delayMs,
        callback,
        options = {}
    ) {
        const {
            timer,
            options:
                normalizedOptions,
        } = prepareTimer({
            name,

            type:
                TIMER_TYPES.ONCE,

            delayMs,
            callback,
            options,
        });

        if (
            normalizedOptions
                .runImmediately
        ) {
            timer.nextRunAt =
                Date.now();

            executeTimer(
                timer
            );
        } else {
            scheduleOnceTimer(
                timer
            );
        }

        logger?.debug(
            `Scheduled one-time task: ${timer.name}`,
            {
                delayMs:
                    timer.delayMs,

                group:
                    timer.group,
            }
        );

        return createPublicSnapshot(
            timer
        );
    }

    function every(
        name,
        intervalMs,
        callback,
        options = {}
    ) {
        const {
            timer,
            options:
                normalizedOptions,
        } = prepareTimer({
            name,

            type:
                TIMER_TYPES.REPEATING,

            delayMs:
                intervalMs,

            callback,
            options,
        });

        if (
            normalizedOptions
                .runImmediately
        ) {
            timer.nextRunAt =
                Date.now();

            executeTimer(
                timer
            );
        } else {
            scheduleRepeatingTimer(
                timer
            );
        }

        logger?.debug(
            `Scheduled repeating task: ${timer.name}`,
            {
                intervalMs:
                    timer.delayMs,

                group:
                    timer.group,
            }
        );

        return createPublicSnapshot(
            timer
        );
    }

    function cancel(name) {
        const normalizedName =
            validateName(name);

        const timer =
            timers.get(
                normalizedName
            );

        if (!timer) {
            return false;
        }

        if (
            timer.handle !== null
        ) {
            clearTimeout(
                timer.handle
            );

            timer.handle =
                null;
        }

        timer.state =
            TIMER_STATES.CANCELLED;

        timer.nextRunAt =
            null;

        timer.remainingMs =
            null;

        events?.emit(
            "scheduler:task-cancelled",
            {
                timer:
                    createPublicSnapshot(
                        timer
                    ),
            }
        );

        timers.delete(
            normalizedName
        );

        logger?.debug(
            `Cancelled scheduled task: ${normalizedName}`
        );

        return true;
    }

    function cancelGroup(group) {
        const normalizedGroup =
            String(
                group || ""
            ).trim();

        if (!normalizedGroup) {
            return 0;
        }

        const names =
            [...timers.values()]
                .filter(
                    (timer) =>
                        timer.group ===
                        normalizedGroup
                )
                .map(
                    (timer) =>
                        timer.name
                );

        for (
            const name of names
        ) {
            cancel(name);
        }

        return names.length;
    }

    function cancelAll() {
        const names =
            [...timers.keys()];

        for (
            const name of names
        ) {
            cancel(name);
        }

        return names.length;
    }

    function pause(name) {
        const normalizedName =
            validateName(name);

        const timer =
            timers.get(
                normalizedName
            );

        if (
            !timer ||
            timer.state ===
                TIMER_STATES.PAUSED
        ) {
            return false;
        }

        const now =
            Date.now();

        timer.remainingMs =
            timer.nextRunAt === null
                ? timer.delayMs
                : Math.max(
                      0,
                      timer.nextRunAt -
                          now
                  );

        if (
            timer.handle !== null
        ) {
            clearTimeout(
                timer.handle
            );

            timer.handle =
                null;
        }

        timer.state =
            TIMER_STATES.PAUSED;

        timer.pausedAt =
            now;

        timer.nextRunAt =
            null;

        events?.emit(
            "scheduler:task-paused",
            {
                timer:
                    createPublicSnapshot(
                        timer
                    ),
            }
        );

        return true;
    }

    function resume(name) {
        const normalizedName =
            validateName(name);

        const timer =
            timers.get(
                normalizedName
            );

        if (
            !timer ||
            timer.state !==
                TIMER_STATES.PAUSED
        ) {
            return false;
        }

        const remaining =
            Number.isFinite(
                timer.remainingMs
            )
                ? timer.remainingMs
                : timer.delayMs;

        timer.pausedAt =
            null;

        timer.remainingMs =
            null;

        if (
            timer.type ===
            TIMER_TYPES.ONCE
        ) {
            scheduleOnceTimer(
                timer,
                remaining
            );
        } else {
            scheduleRepeatingTimer(
                timer,
                remaining
            );
        }

        events?.emit(
            "scheduler:task-resumed",
            {
                timer:
                    createPublicSnapshot(
                        timer
                    ),
            }
        );

        return true;
    }

    function pauseGroup(group) {
        const normalizedGroup =
            String(
                group || ""
            ).trim();

        if (!normalizedGroup) {
            return 0;
        }

        let paused =
            0;

        for (
            const timer of
            timers.values()
        ) {
            if (
                timer.group ===
                    normalizedGroup &&
                pause(timer.name)
            ) {
                paused +=
                    1;
            }
        }

        return paused;
    }

    function resumeGroup(group) {
        const normalizedGroup =
            String(
                group || ""
            ).trim();

        if (!normalizedGroup) {
            return 0;
        }

        let resumed =
            0;

        for (
            const timer of
            timers.values()
        ) {
            if (
                timer.group ===
                    normalizedGroup &&
                resume(timer.name)
            ) {
                resumed +=
                    1;
            }
        }

        return resumed;
    }

    function has(name) {
        try {
            return timers.has(
                validateName(
                    name
                )
            );
        } catch {
            return false;
        }
    }

    function get(name) {
        const normalizedName =
            validateName(name);

        return createPublicSnapshot(
            timers.get(
                normalizedName
            )
        );
    }

    function inspect(
        filters = {}
    ) {
        let results =
            [...timers.values()];

        if (filters.group) {
            results =
                results.filter(
                    (timer) =>
                        timer.group ===
                        filters.group
                );
        }

        if (filters.type) {
            results =
                results.filter(
                    (timer) =>
                        timer.type ===
                        filters.type
                );
        }

        if (filters.state) {
            results =
                results.filter(
                    (timer) =>
                        timer.state ===
                        filters.state
                );
        }

        return results
            .map(
                createPublicSnapshot
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    first.name.localeCompare(
                        second.name
                    )
            );
    }

    function count(
        filters = null
    ) {
        if (!filters) {
            return timers.size;
        }

        return inspect(
            filters
        ).length;
    }

    TACTIC.services.scheduler = {
        once,
        every,

        cancel,
        cancelGroup,
        cancelAll,

        pause,
        resume,
        pauseGroup,
        resumeGroup,

        has,
        get,
        inspect,
        count,

        types:
            TIMER_TYPES,

        states:
            TIMER_STATES,
    };

    logger?.info(
        "Scheduler service loaded"
    );
})();