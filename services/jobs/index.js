/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/jobs/index.js
 *
 * Purpose:
 * Provides centralized queuing, execution, inspection, and
 * lifecycle management for framework work.
 *
 * Responsibilities:
 * - Enqueue named jobs
 * - Order jobs by priority and creation time
 * - Support delayed execution
 * - Limit concurrent execution
 * - Support cancellation, pause, and resume
 * - Apply timeouts and retries
 * - Enforce optional capability requirements
 * - Suppress duplicate queued or active jobs
 * - Maintain bounded job history
 * - Emit lifecycle events
 * - Expose diagnostics and Health information
 *
 * Does NOT:
 * - Decide what gameplay actions should occur
 * - Grant capabilities
 * - Click Torn controls unless a job callback does so
 * - Replace the Scheduler for recurring clock-based tasks
 * - Persist unfinished jobs across page reloads
 *
 * Public API:
 * - enqueue()
 * - cancel()
 * - pause()
 * - resume()
 * - has()
 * - get()
 * - getActive()
 * - getQueue()
 * - getHistory()
 * - clearHistory()
 * - setConcurrency()
 * - inspect()
 *
 * Dependencies:
 * - services/scheduler/index.js
 * - services/capabilities/index.js
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
            "[TACTIC Jobs] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        scheduler,
        capabilities,
        events,
        logger,
        errors,
        health,
    } = services;

    const {
        HEALTH_STATES,
    } = constants;

    if (!scheduler) {
        console.error(
            "[TACTIC Jobs] Scheduler service is unavailable."
        );

        return;
    }

    const SERVICE_NAME =
        "service:jobs";

    const WAKE_TASK_NAME =
        "jobs:queue-wake";

    const WAKE_TASK_GROUP =
        "jobs:system";

    const DEFAULT_CONCURRENCY =
        1;

    const DEFAULT_TIMEOUT_MS =
        30_000;

    const DEFAULT_RETRY_DELAY_MS =
        1_000;

    const DEFAULT_DUPLICATE_WINDOW_MS =
        0;

    const MAX_HISTORY =
        200;

    const PRIORITIES =
        Object.freeze({
            CRITICAL:
                "critical",

            HIGH:
                "high",

            NORMAL:
                "normal",

            LOW:
                "low",

            BACKGROUND:
                "background",
        });

    const PRIORITY_WEIGHTS =
        Object.freeze({
            [PRIORITIES.CRITICAL]:
                500,

            [PRIORITIES.HIGH]:
                400,

            [PRIORITIES.NORMAL]:
                300,

            [PRIORITIES.LOW]:
                200,

            [PRIORITIES.BACKGROUND]:
                100,
        });

    const STATES =
        Object.freeze({
            QUEUED:
                "queued",

            DELAYED:
                "delayed",

            RUNNING:
                "running",

            PAUSED:
                "paused",

            RETRYING:
                "retrying",

            COMPLETED:
                "completed",

            FAILED:
                "failed",

            TIMED_OUT:
                "timed-out",

            CANCELLED:
                "cancelled",

            DUPLICATE:
                "duplicate",

            CAPABILITY_DENIED:
                "capability-denied",
        });

    const queue =
        [];

    const activeJobs =
        new Map();

    const jobsById =
        new Map();

    const history =
        [];

    const recentDuplicateKeys =
        new Map();

    let nextJobId =
        1;

    let concurrency =
        DEFAULT_CONCURRENCY;

    let queueProcessing =
        false;

    const metrics = {
        startedAt:
            Date.now(),

        enqueued:
            0,

        started:
            0,

        completed:
            0,

        failed:
            0,

        timedOut:
            0,

        cancelled:
            0,

        paused:
            0,

        resumed:
            0,

        retries:
            0,

        duplicatesSuppressed:
            0,

        capabilityDenials:
            0,

        historyClears:
            0,

        concurrencyChanges:
            0,

        wakeRequests:
            0,

        processCycles:
            0,

        lastActivityAt:
            Date.now(),

        lastJobId:
            null,

        lastJobName:
            null,

        lastState:
            null,

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

    function normalizeIdentifier(
        value,
        label
    ) {
        if (
            typeof value !==
                "string" ||
            !value.trim()
        ) {
            throw new TypeError(
                `${label} must be a non-empty string.`
            );
        }

        const normalized =
            value.trim();

        if (
            !/^[a-zA-Z0-9:._-]+$/
                .test(normalized)
        ) {
            throw new TypeError(
                `${label} contains unsupported characters.`
            );
        }

        return normalized;
    }

    function normalizePriority(
        priority
    ) {
        const normalized =
            String(
                priority ||
                PRIORITIES.NORMAL
            )
                .trim()
                .toLowerCase();

        return Object.values(
            PRIORITIES
        ).includes(
            normalized
        )
            ? normalized
            : PRIORITIES.NORMAL;
    }

    function normalizeNonNegativeInteger(
        value,
        fallback
    ) {
        const numeric =
            Number(value);

        if (
            !Number.isSafeInteger(
                numeric
            ) ||
            numeric < 0
        ) {
            return fallback;
        }

        return numeric;
    }

    function normalizePositiveInteger(
        value,
        fallback
    ) {
        const numeric =
            Number(value);

        if (
            !Number.isSafeInteger(
                numeric
            ) ||
            numeric <= 0
        ) {
            return fallback;
        }

        return numeric;
    }

    function normalizeDefinition(
        definition
    ) {
        if (
            !isPlainObject(
                definition
            )
        ) {
            throw new TypeError(
                "Job definition must be an object."
            );
        }

        if (
            typeof definition.execute !==
                "function"
        ) {
            throw new TypeError(
                "Job definition requires an execute function."
            );
        }

        const name =
            normalizeIdentifier(
                definition.name ||
                definition.id,
                "Job name"
            );

        return {
            name,

            priority:
                normalizePriority(
                    definition.priority
                ),

            delayMs:
                normalizeNonNegativeInteger(
                    definition.delayMs ??
                    definition.delay,
                    0
                ),

            timeoutMs:
                normalizePositiveInteger(
                    definition.timeoutMs,
                    DEFAULT_TIMEOUT_MS
                ),

            retries:
                normalizeNonNegativeInteger(
                    definition.retries,
                    0
                ),

            retryDelayMs:
                normalizeNonNegativeInteger(
                    definition.retryDelayMs,
                    DEFAULT_RETRY_DELAY_MS
                ),

            duplicateKey:
                normalizeIdentifier(
                    definition.duplicateKey ||
                    name,
                    "Job duplicate key"
                ),

            duplicateWindowMs:
                normalizeNonNegativeInteger(
                    definition
                        .duplicateWindowMs,
                    DEFAULT_DUPLICATE_WINDOW_MS
                ),

            suppressQueuedDuplicates:
                definition
                    .suppressQueuedDuplicates !==
                false,

            capability:
                typeof definition
                    .capability ===
                    "string" &&
                definition.capability.trim()
                    ? definition.capability
                          .trim()
                    : null,

            context:
                isPlainObject(
                    definition.context
                )
                    ? {
                          ...definition.context,
                      }
                    : {},

            metadata:
                isPlainObject(
                    definition.metadata
                )
                    ? {
                          ...definition.metadata,
                      }
                    : {},

            execute:
                definition.execute,

            onComplete:
                typeof definition
                    .onComplete ===
                    "function"
                    ? definition.onComplete
                    : null,

            onFailure:
                typeof definition
                    .onFailure ===
                    "function"
                    ? definition.onFailure
                    : null,

            onCancel:
                typeof definition
                    .onCancel ===
                    "function"
                    ? definition.onCancel
                    : null,

            cleanup:
                typeof definition
                    .cleanup ===
                    "function"
                    ? definition.cleanup
                    : null,
        };
    }

    function createErrorSnapshot(
        error
    ) {
        if (!error) {
            return null;
        }

        return {
            name:
                error.name ||
                "Error",

            message:
                error.message ||
                String(error),

            stack:
                error.stack ||
                null,
        };
    }

    function createRecord(
        definition
    ) {
        const now =
            Date.now();

        return {
            id:
                nextJobId++,

            name:
                definition.name,

            priority:
                definition.priority,

            priorityWeight:
                PRIORITY_WEIGHTS[
                    definition.priority
                ],

            state:
                definition.delayMs > 0
                    ? STATES.DELAYED
                    : STATES.QUEUED,

            capability:
                definition.capability,

            duplicateKey:
                definition.duplicateKey,

            duplicateWindowMs:
                definition
                    .duplicateWindowMs,

            suppressQueuedDuplicates:
                definition
                    .suppressQueuedDuplicates,

            createdAt:
                now,

            availableAt:
                now +
                definition.delayMs,

            queuedAt:
                now,

            startedAt:
                null,

            completedAt:
                null,

            durationMs:
                null,

            attempt:
                0,

            maximumAttempts:
                definition.retries +
                1,

            timeoutMs:
                definition.timeoutMs,

            retryDelayMs:
                definition.retryDelayMs,

            pausedAt:
                null,

            resumedAt:
                null,

            cancelledAt:
                null,

            cancelRequested:
                false,

            result:
                null,

            error:
                null,

            context: {
                ...definition.context,
            },

            metadata: {
                ...definition.metadata,
            },

            execute:
                definition.execute,

            onComplete:
                definition.onComplete,

            onFailure:
                definition.onFailure,

            onCancel:
                definition.onCancel,

            cleanup:
                definition.cleanup,
        };
    }

    function createPublicSnapshot(
        record
    ) {
        if (!record) {
            return null;
        }

        return {
            id:
                record.id,

            name:
                record.name,

            priority:
                record.priority,

            state:
                record.state,

            capability:
                record.capability,

            duplicateKey:
                record.duplicateKey,

            createdAt:
                record.createdAt,

            availableAt:
                record.availableAt,

            queuedAt:
                record.queuedAt,

            startedAt:
                record.startedAt,

            completedAt:
                record.completedAt,

            durationMs:
                record.durationMs,

            attempt:
                record.attempt,

            maximumAttempts:
                record.maximumAttempts,

            timeoutMs:
                record.timeoutMs,

            retryDelayMs:
                record.retryDelayMs,

            pausedAt:
                record.pausedAt,

            resumedAt:
                record.resumedAt,

            cancelledAt:
                record.cancelledAt,

            cancelRequested:
                record.cancelRequested,

            result:
                cloneValue(
                    record.result
                ),

            error:
                record.error
                    ? {
                          ...record.error,
                      }
                    : null,

            context:
                cloneValue(
                    record.context
                ),

            metadata: {
                ...record.metadata,
            },
        };
    }

    function recordActivity(
        operation,
        record = null,
        metadata = {}
    ) {
        metrics.lastActivityAt =
            Date.now();

        if (record) {
            metrics.lastJobId =
                record.id;

            metrics.lastJobName =
                record.name;

            metrics.lastState =
                record.state;
        }

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    queueCount:
                        queue.length,

                    activeCount:
                        activeJobs.size,

                    historyCount:
                        history.length,

                    concurrency,

                    lastJobId:
                        metrics.lastJobId,

                    lastJobName:
                        metrics.lastJobName,

                    lastState:
                        metrics.lastState,

                    ...metadata,
                },
            }
        );
    }

    function emit(
        eventName,
        record,
        extra = {}
    ) {
        events?.emit(
            eventName,
            {
                job:
                    createPublicSnapshot(
                        record
                    ),

                ...extra,
            }
        );
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
        record
    ) {
        if (
            !history.includes(
                record
            )
        ) {
            history.push(
                record
            );

            trimHistory();
        }
    }

    function removeFromQueue(
        jobId
    ) {
        const index =
            queue.findIndex(
                (record) =>
                    record.id ===
                    jobId
            );

        if (index < 0) {
            return null;
        }

        const [
            removed,
        ] =
            queue.splice(
                index,
                1
            );

        return removed;
    }

    function sortQueue() {
        queue.sort(
            (
                first,
                second
            ) => {
                if (
                    first.priorityWeight !==
                    second.priorityWeight
                ) {
                    return (
                        second.priorityWeight -
                        first.priorityWeight
                    );
                }

                if (
                    first.availableAt !==
                    second.availableAt
                ) {
                    return (
                        first.availableAt -
                        second.availableAt
                    );
                }

                return (
                    first.createdAt -
                    second.createdAt
                );
            }
        );
    }

    function isQueuedDuplicate(
        definition
    ) {
        if (
            !definition
                .suppressQueuedDuplicates
        ) {
            return false;
        }

        const queuedDuplicate =
            queue.some(
                (record) =>
                    record.duplicateKey ===
                    definition.duplicateKey &&
                    ![
                        STATES.CANCELLED,
                        STATES.COMPLETED,
                        STATES.FAILED,
                    ].includes(
                        record.state
                    )
            );

        const activeDuplicate = [
            ...activeJobs.values(),
        ].some(
            (record) =>
                record.duplicateKey ===
                definition.duplicateKey
        );

        return (
            queuedDuplicate ||
            activeDuplicate
        );
    }

    function isRecentDuplicate(
        definition
    ) {
        if (
            definition
                .duplicateWindowMs <=
            0
        ) {
            return false;
        }

        const previousAt =
            recentDuplicateKeys.get(
                definition.duplicateKey
            );

        return (
            Number.isFinite(
                previousAt
            ) &&
            Date.now() -
                previousAt <
                definition
                    .duplicateWindowMs
        );
    }

    function createDuplicateRecord(
        definition
    ) {
        const record =
            createRecord(
                definition
            );

        record.state =
            STATES.DUPLICATE;

        record.completedAt =
            Date.now();

        record.durationMs =
            0;

        jobsById.set(
            record.id,
            record
        );

        addToHistory(
            record
        );

        metrics
            .duplicatesSuppressed +=
            1;

        recordActivity(
            "duplicate-suppressed",
            record
        );

        emit(
            "job:duplicate",
            record
        );

        return record;
    }

    function scheduleWake() {
        metrics.wakeRequests +=
            1;

        scheduler.cancel?.(
            WAKE_TASK_NAME
        );

        const delayedJobs =
            queue.filter(
                (record) =>
                    record.state ===
                    STATES.DELAYED
            );

        if (
            delayedJobs.length ===
            0
        ) {
            return false;
        }

        const nextAvailableAt =
            Math.min(
                ...delayedJobs.map(
                    (record) =>
                        record.availableAt
                )
            );

        const delayMs =
            Math.max(
                0,
                nextAvailableAt -
                Date.now()
            );

        scheduler.once(
            WAKE_TASK_NAME,
            delayMs,
            () => {
                processQueue();
            },
            {
                group:
                    WAKE_TASK_GROUP,

                replaceExisting:
                    true,

                continueOnError:
                    true,

                metadata: {
                    service:
                        "jobs",

                    purpose:
                        "queue-wake",
                },
            }
        );

        return true;
    }

    function updateDelayedStates() {
        const now =
            Date.now();

        for (
            const record of
            queue
        ) {
            if (
                record.state ===
                    STATES.DELAYED &&
                record.availableAt <=
                    now
            ) {
                record.state =
                    STATES.QUEUED;
            }
        }
    }

    function nextRunnableJob() {
        updateDelayedStates();

        sortQueue();

        return (
            queue.find(
                (record) =>
                    record.state ===
                    STATES.QUEUED
            ) ||
            null
        );
    }

    function createTimeoutError(
        record
    ) {
        const error =
            new Error(
                `Job "${record.name}" timed out after ${record.timeoutMs} ms.`
            );

        error.name =
            "JobTimeoutError";

        return error;
    }

    function delay(
        milliseconds
    ) {
        return new Promise(
            (resolve) => {
                setTimeout(
                    resolve,
                    milliseconds
                );
            }
        );
    }

    function withTimeout(
        promise,
        record
    ) {
        return new Promise(
            (
                resolve,
                reject
            ) => {
                const timeoutHandle =
                    setTimeout(
                        () => {
                            reject(
                                createTimeoutError(
                                    record
                                )
                            );
                        },
                        record.timeoutMs
                    );

                Promise.resolve(
                    promise
                ).then(
                    (value) => {
                        clearTimeout(
                            timeoutHandle
                        );

                        resolve(
                            value
                        );
                    },
                    (error) => {
                        clearTimeout(
                            timeoutHandle
                        );

                        reject(
                            error
                        );
                    }
                );
            }
        );
    }

    function createExecutionContext(
        record
    ) {
        return {
            job:
                createPublicSnapshot(
                    record
                ),

            context:
                record.context,

            attempt:
                record.attempt,

            isCancelled() {
                return (
                    record.cancelRequested ===
                    true
                );
            },

            throwIfCancelled() {
                if (
                    record
                        .cancelRequested
                ) {
                    const error =
                        new Error(
                            `Job "${record.name}" was cancelled.`
                        );

                    error.name =
                        "JobCancelledError";

                    throw error;
                }
            },

            services:
                TACTIC.services,

            repositories:
                TACTIC.repositories,

            modules:
                TACTIC.modules,
        };
    }

    async function invokeCallback(
        callback,
        payload,
        callbackName,
        record
    ) {
        if (
            typeof callback !==
            "function"
        ) {
            return;
        }

        try {
            await callback(
                payload
            );
        } catch (error) {
            logger?.warn(
                `Job ${callbackName} callback failed: ${record.name}`,
                {
                    jobId:
                        record.id,

                    error,
                }
            );
        }
    }

    async function runCleanup(
        record
    ) {
        await invokeCallback(
            record.cleanup,
            {
                job:
                    createPublicSnapshot(
                        record
                    ),

                context:
                    record.context,

                services:
                    TACTIC.services,
            },
            "cleanup",
            record
        );
    }

    function capabilityAllowed(
        record
    ) {
        if (!record.capability) {
            return {
                allowed:
                    true,

                reason:
                    "capability-not-required",
            };
        }

        if (!capabilities) {
            return {
                allowed:
                    false,

                reason:
                    "capabilities-service-unavailable",
            };
        }

        return capabilities.explain(
            record.capability
        );
    }

    async function executeJob(
        record
    ) {
        activeJobs.set(
            record.id,
            record
        );

        record.startedAt =
            record.startedAt ||
            Date.now();

        record.state =
            STATES.RUNNING;

        metrics.started +=
            1;

        recentDuplicateKeys.set(
            record.duplicateKey,
            Date.now()
        );

        emit(
            "job:started",
            record
        );

        recordActivity(
            "started",
            record
        );

        logger?.debug(
            `Job started: ${record.name}`,
            {
                jobId:
                    record.id,

                priority:
                    record.priority,
            }
        );

        try {
            const capabilityDecision =
                capabilityAllowed(
                    record
                );

            if (
                !capabilityDecision.allowed
            ) {
                metrics.capabilityDenials +=
                    1;

                record.state =
                    STATES
                        .CAPABILITY_DENIED;

                record.error = {
                    name:
                        "CapabilityDeniedError",

                    message:
                        `Job capability denied: ${record.capability}.`,

                    reason:
                        capabilityDecision.reason,
                };

                emit(
                    "job:capability-denied",
                    record,
                    {
                        decision:
                            capabilityDecision,
                    }
                );

                return;
            }

            let finalError =
                null;

            for (
                let attempt = 1;
                attempt <=
                record.maximumAttempts;
                attempt += 1
            ) {
                record.attempt =
                    attempt;

                if (
                    record.cancelRequested
                ) {
                    const error =
                        new Error(
                            `Job "${record.name}" was cancelled.`
                        );

                    error.name =
                        "JobCancelledError";

                    throw error;
                }

                try {
                    record.state =
                        STATES.RUNNING;

                    const result =
                        await withTimeout(
                            record.execute(
                                createExecutionContext(
                                    record
                                )
                            ),
                            record
                        );

                    if (
                        record.cancelRequested
                    ) {
                        const error =
                            new Error(
                                `Job "${record.name}" was cancelled.`
                            );

                        error.name =
                            "JobCancelledError";

                        throw error;
                    }

                    record.result =
                        cloneValue(
                            result
                        );

                    finalError =
                        null;

                    break;
                } catch (error) {
                    finalError =
                        error;

                    if (
                        error?.name ===
                        "JobCancelledError"
                    ) {
                        break;
                    }

                    if (
                        attempt <
                        record
                            .maximumAttempts
                    ) {
                        metrics.retries +=
                            1;

                        record.state =
                            STATES.RETRYING;

                        emit(
                            "job:retrying",
                            record,
                            {
                                error,

                                nextAttempt:
                                    attempt +
                                    1,
                            }
                        );

                        if (
                            record.retryDelayMs >
                            0
                        ) {
                            await delay(
                                record.retryDelayMs
                            );
                        }
                    }
                }
            }

            if (finalError) {
                throw finalError;
            }

            record.state =
                STATES.COMPLETED;

            metrics.completed +=
                1;

            emit(
                "job:completed",
                record
            );

            await invokeCallback(
                record.onComplete,
                {
                    job:
                        createPublicSnapshot(
                            record
                        ),

                    result:
                        cloneValue(
                            record.result
                        ),

                    context:
                        record.context,
                },
                "completion",
                record
            );
        } catch (error) {
            if (
                error?.name ===
                "JobCancelledError"
            ) {
                record.state =
                    STATES.CANCELLED;

                record.cancelledAt =
                    Date.now();

                metrics.cancelled +=
                    1;

                emit(
                    "job:cancelled",
                    record
                );

                await invokeCallback(
                    record.onCancel,
                    {
                        job:
                            createPublicSnapshot(
                                record
                            ),

                        context:
                            record.context,
                    },
                    "cancellation",
                    record
                );
            } else {
                const timedOut =
                    error?.name ===
                    "JobTimeoutError";

                record.state =
                    timedOut
                        ? STATES.TIMED_OUT
                        : STATES.FAILED;

                record.error =
                    createErrorSnapshot(
                        error
                    );

                metrics.lastError =
                    record.error;

                if (timedOut) {
                    metrics.timedOut +=
                        1;
                } else {
                    metrics.failed +=
                        1;
                }

                emit(
                    "job:failed",
                    record,
                    {
                        error,
                    }
                );

                await invokeCallback(
                    record.onFailure,
                    {
                        job:
                            createPublicSnapshot(
                                record
                            ),

                        error,

                        context:
                            record.context,
                    },
                    "failure",
                    record
                );

                errors?.report({
                    code:
                        TACTIC.ERROR_CODES
                            ?.GENERAL
                            ?.INTERNAL ||
                        "INTERNAL",

                    severity:
                        TACTIC.SEVERITY
                            ?.ERROR ||
                        "error",

                    service:
                        "jobs",

                    message:
                        `Job "${record.name}" failed: ${error.message}`,

                    details: {
                        jobId:
                            record.id,

                        state:
                            record.state,

                        attempt:
                            record.attempt,

                        capability:
                            record.capability,
                    },

                    error,

                    recoverable:
                        true,

                    retryable:
                        false,

                    recovery:
                        "Review the job history and its external dependencies before retrying.",
                });
            }
        } finally {
            record.completedAt =
                Date.now();

            record.durationMs =
                record.startedAt
                    ? record.completedAt -
                      record.startedAt
                    : 0;

            activeJobs.delete(
                record.id
            );

            await runCleanup(
                record
            );

            addToHistory(
                record
            );

            recordActivity(
                "finished",
                record
            );

            processQueue();
        }
    }

    async function processQueue() {
        if (queueProcessing) {
            return false;
        }

        queueProcessing =
            true;

        metrics.processCycles +=
            1;

        try {
            while (
                activeJobs.size <
                concurrency
            ) {
                const record =
                    nextRunnableJob();

                if (!record) {
                    scheduleWake();

                    break;
                }

                removeFromQueue(
                    record.id
                );

                executeJob(
                    record
                );
            }

            return true;
        } finally {
            queueProcessing =
                false;
        }
    }

    function enqueue(
        definition
    ) {
        const normalized =
            normalizeDefinition(
                definition
            );

        metrics.enqueued +=
            1;

        if (
            isQueuedDuplicate(
                normalized
            ) ||
            isRecentDuplicate(
                normalized
            )
        ) {
            return createPublicSnapshot(
                createDuplicateRecord(
                    normalized
                )
            );
        }

        const record =
            createRecord(
                normalized
            );

        jobsById.set(
            record.id,
            record
        );

        queue.push(
            record
        );

        sortQueue();

        emit(
            "job:queued",
            record
        );

        recordActivity(
            "enqueued",
            record
        );

        processQueue();

        return createPublicSnapshot(
            record
        );
    }

    function getRecord(
        jobId
    ) {
        const id =
            Number(
                jobId
            );

        if (
            !Number.isSafeInteger(
                id
            )
        ) {
            return null;
        }

        return (
            jobsById.get(
                id
            ) ||
            null
        );
    }

    function has(
        jobId
    ) {
        return Boolean(
            getRecord(
                jobId
            )
        );
    }

    function get(
        jobId
    ) {
        return createPublicSnapshot(
            getRecord(
                jobId
            )
        );
    }

    function cancel(
        jobId
    ) {
        const record =
            getRecord(
                jobId
            );

        if (!record) {
            return false;
        }

        if (
            [
                STATES.COMPLETED,
                STATES.FAILED,
                STATES.TIMED_OUT,
                STATES.CANCELLED,
                STATES.DUPLICATE,
                STATES.CAPABILITY_DENIED,
            ].includes(
                record.state
            )
        ) {
            return false;
        }

        if (
            activeJobs.has(
                record.id
            )
        ) {
            record.cancelRequested =
                true;

            recordActivity(
                "cancel-requested",
                record
            );

            return true;
        }

        removeFromQueue(
            record.id
        );

        record.state =
            STATES.CANCELLED;

        record.cancelledAt =
            Date.now();

        record.completedAt =
            record.cancelledAt;

        record.durationMs =
            0;

        metrics.cancelled +=
            1;

        addToHistory(
            record
        );

        emit(
            "job:cancelled",
            record
        );

        recordActivity(
            "cancelled",
            record
        );

        invokeCallback(
            record.onCancel,
            {
                job:
                    createPublicSnapshot(
                        record
                    ),

                context:
                    record.context,
            },
            "cancellation",
            record
        );

        processQueue();

        return true;
    }

    function pause(
        jobId
    ) {
        const record =
            getRecord(
                jobId
            );

        if (
            !record ||
            !queue.includes(
                record
            ) ||
            ![
                STATES.QUEUED,
                STATES.DELAYED,
            ].includes(
                record.state
            )
        ) {
            return false;
        }

        record.state =
            STATES.PAUSED;

        record.pausedAt =
            Date.now();

        metrics.paused +=
            1;

        emit(
            "job:paused",
            record
        );

        recordActivity(
            "paused",
            record
        );

        scheduleWake();

        return true;
    }

    function resume(
        jobId
    ) {
        const record =
            getRecord(
                jobId
            );

        if (
            !record ||
            record.state !==
                STATES.PAUSED
        ) {
            return false;
        }

        record.state =
            record.availableAt >
            Date.now()
                ? STATES.DELAYED
                : STATES.QUEUED;

        record.resumedAt =
            Date.now();

        metrics.resumed +=
            1;

        emit(
            "job:resumed",
            record
        );

        recordActivity(
            "resumed",
            record
        );

        processQueue();

        return true;
    }

    function getActive() {
        return [
            ...activeJobs.values(),
        ].map(
            createPublicSnapshot
        );
    }

    function getQueue(
        filters = {}
    ) {
        let results = [
            ...queue,
        ];

        if (filters.state) {
            results =
                results.filter(
                    (record) =>
                        record.state ===
                        filters.state
                );
        }

        if (filters.priority) {
            const priority =
                normalizePriority(
                    filters.priority
                );

            results =
                results.filter(
                    (record) =>
                        record.priority ===
                        priority
                );
        }

        if (filters.name) {
            results =
                results.filter(
                    (record) =>
                        record.name ===
                        filters.name
                );
        }

        sortQueue();

        return results.map(
            createPublicSnapshot
        );
    }

    function getHistory(
        filters = {}
    ) {
        let results = [
            ...history,
        ];

        if (filters.state) {
            results =
                results.filter(
                    (record) =>
                        record.state ===
                        filters.state
                );
        }

        if (filters.name) {
            results =
                results.filter(
                    (record) =>
                        record.name ===
                        filters.name
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
            createPublicSnapshot
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

    function setConcurrency(
        value
    ) {
        const normalized =
            normalizePositiveInteger(
                value,
                concurrency
            );

        concurrency =
            normalized;

        metrics.concurrencyChanges +=
            1;

        recordActivity(
            "concurrency-changed",
            null,
            {
                concurrency,
            }
        );

        processQueue();

        return concurrency;
    }

    function inspect() {
        return {
            service:
                "jobs",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            concurrency,

            queueCount:
                queue.length,

            activeCount:
                activeJobs.size,

            historyCount:
                history.length,

            queue:
                getQueue(),

            active:
                getActive(),

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

            priorities: {
                ...PRIORITIES,
            },

            states: {
                ...STATES,
            },

            defaults: {
                concurrency:
                    DEFAULT_CONCURRENCY,

                timeoutMs:
                    DEFAULT_TIMEOUT_MS,

                retryDelayMs:
                    DEFAULT_RETRY_DELAY_MS,

                duplicateWindowMs:
                    DEFAULT_DUPLICATE_WINDOW_MS,

                maximumHistory:
                    MAX_HISTORY,
            },
        };
    }

    TACTIC.services.jobs =
        Object.freeze({
            enqueue,

            cancel,
            pause,
            resume,

            has,
            get,

            getActive,
            getQueue,
            getHistory,
            clearHistory,

            setConcurrency,

            inspect,

            priorities:
                PRIORITIES,

            states:
                STATES,
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
                "jobs",

            concurrency,

            persistentJobs:
                false,

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Job service loaded",
        {
            concurrency,
        }
    );
})();