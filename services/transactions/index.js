/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/transactions/index.js
 *
 * Purpose:
 * Provides safe, observable, serialized execution of multi-step
 * browser transactions for TACTIC applications.
 *
 * Responsibilities:
 * - Execute named transactions
 * - Prevent overlapping transactions with the same lock
 * - Suppress duplicate requests during a cooldown
 * - Run preparation, navigation, validation, performance, and
 *   verification steps in a predictable order
 * - Apply timeouts and optional retries
 * - Run optional rollback and cleanup hooks
 * - Maintain bounded transaction history
 * - Emit lifecycle events
 * - Expose diagnostics and Health information
 *
 * Does NOT:
 * - Know how Torn pages or controls work
 * - Click buttons unless a caller supplies a perform callback
 * - Decide whether a transaction should occur
 * - Store application-specific pending transaction state
 * - Guarantee that external websites can reverse an action
 *
 * Public API:
 * - execute()
 * - isLocked()
 * - getActive()
 * - get()
 * - getHistory()
 * - clearHistory()
 * - inspect()
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
            "[TACTIC Transactions] Namespace is unavailable."
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
        "service:transactions";

    const DEFAULT_TIMEOUT_MS =
        15_000;

    const DEFAULT_DUPLICATE_COOLDOWN_MS =
        20_000;

    const DEFAULT_RETRY_DELAY_MS =
        500;

    const MAX_HISTORY =
        100;

    const STATES =
        Object.freeze({
            PENDING:
                "pending",

            RUNNING:
                "running",

            PREPARING:
                "preparing",

            NAVIGATING:
                "navigating",

            VALIDATING:
                "validating",

            PERFORMING:
                "performing",

            VERIFYING:
                "verifying",

            ROLLING_BACK:
                "rolling-back",

            COMPLETED:
                "completed",

            FAILED:
                "failed",

            CANCELLED:
                "cancelled",

            DUPLICATE:
                "duplicate",

            LOCKED:
                "locked",

            TIMED_OUT:
                "timed-out",
        });

    const STEP_NAMES =
        Object.freeze([
            "prepare",
            "navigate",
            "validate",
            "perform",
            "verify",
        ]);

    const STEP_STATES =
        Object.freeze({
            prepare:
                STATES.PREPARING,

            navigate:
                STATES.NAVIGATING,

            validate:
                STATES.VALIDATING,

            perform:
                STATES.PERFORMING,

            verify:
                STATES.VERIFYING,
        });

    const activeTransactions =
        new Map();

    const locks =
        new Map();

    const recentRequests =
        new Map();

    const history =
        [];

    let nextTransactionId =
        1;

    const metrics = {
        startedAt:
            Date.now(),

        requested:
            0,

        started:
            0,

        completed:
            0,

        failed:
            0,

        timedOut:
            0,

        duplicatesSuppressed:
            0,

        lockConflicts:
            0,

        retries:
            0,

        rollbacksAttempted:
            0,

        rollbacksCompleted:
            0,

        rollbackFailures:
            0,

        historyClears:
            0,

        lastActivityAt:
            Date.now(),

        lastTransactionId:
            null,

        lastTransactionName:
            null,

        lastState:
            null,
    };

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
            !/^[a-zA-Z0-9:_-]+$/
                .test(normalized)
        ) {
            throw new TypeError(
                `${label} may only contain letters, numbers, colons, underscores, and hyphens.`
            );
        }

        return normalized;
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

    function normalizeOptions(
        definition
    ) {
        const name =
            normalizeIdentifier(
                definition.name ||
                    definition.id,
                "Transaction name"
            );

        const lockKey =
            normalizeIdentifier(
                definition.lockKey ||
                    name,
                "Transaction lock key"
            );

        return {
            name,
            lockKey,

            duplicateKey:
                normalizeIdentifier(
                    definition
                        .duplicateKey ||
                        name,
                    "Transaction duplicate key"
                ),

            timeoutMs:
                normalizePositiveInteger(
                    definition.timeoutMs,
                    DEFAULT_TIMEOUT_MS
                ),

            duplicateCooldownMs:
                normalizeNonNegativeInteger(
                    definition
                        .duplicateCooldownMs,
                    DEFAULT_DUPLICATE_COOLDOWN_MS
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

            metadata:
                definition.metadata &&
                typeof definition
                    .metadata ===
                    "object" &&
                !Array.isArray(
                    definition.metadata
                )
                    ? {
                          ...definition.metadata,
                      }
                    : {},

            context:
                definition.context &&
                typeof definition
                    .context ===
                    "object" &&
                !Array.isArray(
                    definition.context
                )
                    ? {
                          ...definition.context,
                      }
                    : {},

            prepare:
                typeof definition
                    .prepare ===
                    "function"
                    ? definition.prepare
                    : null,

            navigate:
                typeof definition
                    .navigate ===
                    "function"
                    ? definition.navigate
                    : null,

            validate:
                typeof definition
                    .validate ===
                    "function"
                    ? definition.validate
                    : null,

            perform:
                typeof definition
                    .perform ===
                    "function"
                    ? definition.perform
                    : null,

            verify:
                typeof definition
                    .verify ===
                    "function"
                    ? definition.verify
                    : null,

            rollback:
                typeof definition
                    .rollback ===
                    "function"
                    ? definition.rollback
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
        options
    ) {
        const now =
            Date.now();

        return {
            id:
                nextTransactionId++,

            name:
                options.name,

            lockKey:
                options.lockKey,

            duplicateKey:
                options.duplicateKey,

            state:
                STATES.PENDING,

            attempt:
                0,

            maximumAttempts:
                options.retries + 1,

            createdAt:
                now,

            startedAt:
                null,

            completedAt:
                null,

            durationMs:
                null,

            currentStep:
                null,

            stepHistory:
                [],

            result:
                null,

            error:
                null,

            rollback: {
                attempted:
                    false,

                completed:
                    false,

                error:
                    null,
            },

            metadata: {
                ...options.metadata,
            },

            context: {
                ...options.context,
            },
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

            lockKey:
                record.lockKey,

            duplicateKey:
                record.duplicateKey,

            state:
                record.state,

            attempt:
                record.attempt,

            maximumAttempts:
                record.maximumAttempts,

            createdAt:
                record.createdAt,

            startedAt:
                record.startedAt,

            completedAt:
                record.completedAt,

            durationMs:
                record.durationMs,

            currentStep:
                record.currentStep,

            stepHistory:
                record.stepHistory.map(
                    (step) => ({
                        ...step,

                        error:
                            step.error
                                ? {
                                      ...step.error,
                                  }
                                : null,
                    })
                ),

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

            rollback: {
                attempted:
                    record.rollback
                        .attempted,

                completed:
                    record.rollback
                        .completed,

                error:
                    record.rollback
                        .error
                        ? {
                              ...record
                                  .rollback
                                  .error,
                          }
                        : null,
            },

            metadata: {
                ...record.metadata,
            },

            context:
                cloneValue(
                    record.context
                ),
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
        record
    ) {
        history.push(
            record
        );

        trimHistory();
    }

    function emit(
        eventName,
        record,
        extra = {}
    ) {
        events?.emit(
            eventName,
            {
                transaction:
                    createPublicSnapshot(
                        record
                    ),

                ...extra,
            }
        );
    }

    function updateHealth(
        operation,
        record = null
    ) {
        metrics.lastActivityAt =
            Date.now();

        if (record) {
            metrics.lastTransactionId =
                record.id;

            metrics.lastTransactionName =
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

                    activeCount:
                        activeTransactions
                            .size,

                    lockCount:
                        locks.size,

                    historyCount:
                        history.length,

                    lastTransactionId:
                        metrics
                            .lastTransactionId,

                    lastTransactionName:
                        metrics
                            .lastTransactionName,

                    lastState:
                        metrics.lastState,
                },
            }
        );
    }

    function createTimeoutError(
        transactionName,
        timeoutMs
    ) {
        const error =
            new Error(
                `Transaction "${transactionName}" timed out after ${timeoutMs} ms.`
            );

        error.name =
            "TransactionTimeoutError";

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
        timeoutMs,
        transactionName
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
                                    transactionName,
                                    timeoutMs
                                )
                            );
                        },
                        timeoutMs
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

    function validateStepResult(
        stepName,
        result
    ) {
        if (
            result === false
        ) {
            throw new Error(
                `Transaction step "${stepName}" returned false.`
            );
        }

        if (
            result &&
            typeof result ===
                "object" &&
            result.success ===
                false
        ) {
            throw new Error(
                result.message ||
                `Transaction step "${stepName}" failed.`
            );
        }

        return result;
    }

    async function runStep(
        record,
        stepName,
        callback
    ) {
        if (!callback) {
            return undefined;
        }

        record.currentStep =
            stepName;

        record.state =
            STEP_STATES[
                stepName
            ];

        const stepRecord = {
            name:
                stepName,

            state:
                "running",

            startedAt:
                Date.now(),

            completedAt:
                null,

            durationMs:
                null,

            result:
                null,

            error:
                null,
        };

        record.stepHistory.push(
            stepRecord
        );

        emit(
            "transaction:step-started",
            record,
            {
                step:
                    stepName,
            }
        );

        updateHealth(
            `step:${stepName}`,
            record
        );

        try {
            const result =
                await callback({
                    transaction:
                        createPublicSnapshot(
                            record
                        ),

                    context:
                        record.context,

                    attempt:
                        record.attempt,

                    services:
                        TACTIC.services,

                    repositories:
                        TACTIC.repositories,

                    modules:
                        TACTIC.modules,
                });

            validateStepResult(
                stepName,
                result
            );

            stepRecord.state =
                "completed";

            stepRecord.completedAt =
                Date.now();

            stepRecord.durationMs =
                stepRecord.completedAt -
                stepRecord.startedAt;

            stepRecord.result =
                cloneValue(
                    result
                );

            emit(
                "transaction:step-completed",
                record,
                {
                    step:
                        stepName,

                    result:
                        cloneValue(
                            result
                        ),
                }
            );

            return result;
        } catch (error) {
            stepRecord.state =
                "failed";

            stepRecord.completedAt =
                Date.now();

            stepRecord.durationMs =
                stepRecord.completedAt -
                stepRecord.startedAt;

            stepRecord.error =
                createErrorSnapshot(
                    error
                );

            emit(
                "transaction:step-failed",
                record,
                {
                    step:
                        stepName,

                    error,
                }
            );

            throw error;
        }
    }

    async function runRollback(
        record,
        options,
        originalError
    ) {
        if (!options.rollback) {
            return false;
        }

        metrics.rollbacksAttempted +=
            1;

        record.rollback.attempted =
            true;

        record.state =
            STATES.ROLLING_BACK;

        emit(
            "transaction:rollback-started",
            record
        );

        try {
            await options.rollback({
                transaction:
                    createPublicSnapshot(
                        record
                    ),

                context:
                    record.context,

                error:
                    originalError,

                services:
                    TACTIC.services,

                repositories:
                    TACTIC.repositories,
            });

            metrics.rollbacksCompleted +=
                1;

            record.rollback.completed =
                true;

            emit(
                "transaction:rollback-completed",
                record
            );

            return true;
        } catch (rollbackError) {
            metrics.rollbackFailures +=
                1;

            record.rollback.error =
                createErrorSnapshot(
                    rollbackError
                );

            emit(
                "transaction:rollback-failed",
                record,
                {
                    error:
                        rollbackError,
                }
            );

            logger?.error(
                `Transaction rollback failed: ${record.name}`,
                {
                    transactionId:
                        record.id,

                    error:
                        rollbackError,
                }
            );

            return false;
        }
    }

    async function runCleanup(
        record,
        options
    ) {
        if (!options.cleanup) {
            return;
        }

        try {
            await options.cleanup({
                transaction:
                    createPublicSnapshot(
                        record
                    ),

                context:
                    record.context,

                services:
                    TACTIC.services,

                repositories:
                    TACTIC.repositories,
            });
        } catch (error) {
            logger?.warn(
                `Transaction cleanup failed: ${record.name}`,
                {
                    transactionId:
                        record.id,

                    error,
                }
            );
        }
    }

    function acquireLock(
        record
    ) {
        if (
            locks.has(
                record.lockKey
            )
        ) {
            return false;
        }

        locks.set(
            record.lockKey,
            record.id
        );

        return true;
    }

    function releaseLock(
        record
    ) {
        if (
            locks.get(
                record.lockKey
            ) === record.id
        ) {
            locks.delete(
                record.lockKey
            );
        }
    }

    function isDuplicate(
        options
    ) {
        if (
            options
                .duplicateCooldownMs <=
            0
        ) {
            return false;
        }

        const previousRequestAt =
            recentRequests.get(
                options.duplicateKey
            );

        if (
            !Number.isFinite(
                previousRequestAt
            )
        ) {
            return false;
        }

        return (
            Date.now() -
                previousRequestAt <
            options
                .duplicateCooldownMs
        );
    }

    async function executeAttempt(
        record,
        options
    ) {
        let latestResult =
            null;

        for (
            const stepName of
            STEP_NAMES
        ) {
            const callback =
                options[
                    stepName
                ];

            if (!callback) {
                continue;
            }

            latestResult =
                await runStep(
                    record,
                    stepName,
                    callback
                );

            if (
                latestResult &&
                typeof latestResult ===
                    "object" &&
                latestResult.context &&
                typeof latestResult
                    .context ===
                    "object"
            ) {
                Object.assign(
                    record.context,
                    latestResult.context
                );
            }
        }

        return latestResult;
    }

    async function execute(
        definition
    ) {
        if (
            !definition ||
            typeof definition !==
                "object" ||
            Array.isArray(
                definition
            )
        ) {
            throw new TypeError(
                "Transaction definition must be an object."
            );
        }

        const options =
            normalizeOptions(
                definition
            );

        metrics.requested +=
            1;

        if (
            isDuplicate(
                options
            )
        ) {
            metrics
                .duplicatesSuppressed +=
                1;

            const duplicateRecord =
                createRecord(
                    options
                );

            duplicateRecord.state =
                STATES.DUPLICATE;

            duplicateRecord.completedAt =
                Date.now();

            duplicateRecord.durationMs =
                0;

            addToHistory(
                duplicateRecord
            );

            updateHealth(
                "duplicate-suppressed",
                duplicateRecord
            );

            emit(
                "transaction:duplicate",
                duplicateRecord
            );

            return createPublicSnapshot(
                duplicateRecord
            );
        }

        const record =
            createRecord(
                options
            );

        if (
            !acquireLock(
                record
            )
        ) {
            metrics.lockConflicts +=
                1;

            record.state =
                STATES.LOCKED;

            record.completedAt =
                Date.now();

            record.durationMs =
                0;

            addToHistory(
                record
            );

            updateHealth(
                "lock-conflict",
                record
            );

            emit(
                "transaction:locked",
                record
            );

            return createPublicSnapshot(
                record
            );
        }

        recentRequests.set(
            options.duplicateKey,
            Date.now()
        );

        activeTransactions.set(
            record.id,
            record
        );

        metrics.started +=
            1;

        record.startedAt =
            Date.now();

        record.state =
            STATES.RUNNING;

        emit(
            "transaction:started",
            record
        );

        updateHealth(
            "started",
            record
        );

        logger?.info(
            `Transaction started: ${record.name}`,
            {
                transactionId:
                    record.id,

                lockKey:
                    record.lockKey,
            }
        );

        try {
            let finalResult =
                null;

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

                try {
                    finalResult =
                        await withTimeout(
                            executeAttempt(
                                record,
                                options
                            ),
                            options.timeoutMs,
                            record.name
                        );

                    finalError =
                        null;

                    break;
                } catch (error) {
                    finalError =
                        error;

                    if (
                        attempt <
                        record.maximumAttempts
                    ) {
                        metrics.retries +=
                            1;

                        emit(
                            "transaction:retrying",
                            record,
                            {
                                attempt,
                                nextAttempt:
                                    attempt +
                                    1,

                                error,
                            }
                        );

                        if (
                            options.retryDelayMs >
                            0
                        ) {
                            await delay(
                                options
                                    .retryDelayMs
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

            record.result =
                cloneValue(
                    finalResult
                );

            record.completedAt =
                Date.now();

            record.durationMs =
                record.completedAt -
                record.startedAt;

            metrics.completed +=
                1;

            emit(
                "transaction:completed",
                record
            );

            logger?.info(
                `Transaction completed: ${record.name}`,
                {
                    transactionId:
                        record.id,

                    durationMs:
                        record.durationMs,
                }
            );

            return createPublicSnapshot(
                record
            );
        } catch (error) {
            const timedOut =
                error?.name ===
                "TransactionTimeoutError";

            record.state =
                timedOut
                    ? STATES.TIMED_OUT
                    : STATES.FAILED;

            record.error =
                createErrorSnapshot(
                    error
                );

            record.completedAt =
                Date.now();

            record.durationMs =
                record.completedAt -
                record.startedAt;

            if (timedOut) {
                metrics.timedOut +=
                    1;
            } else {
                metrics.failed +=
                    1;
            }

            await runRollback(
                record,
                options,
                error
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
                    "transactions",

                message:
                    `Transaction "${record.name}" failed: ${error.message}`,

                details: {
                    transactionId:
                        record.id,

                    transactionName:
                        record.name,

                    state:
                        record.state,

                    attempt:
                        record.attempt,

                    currentStep:
                        record.currentStep,
                },

                error,

                recoverable:
                    true,

                retryable:
                    record.attempt <
                    record
                        .maximumAttempts,

                recovery:
                    "Review the transaction history and retry after its external dependencies are ready.",
            });

            emit(
                "transaction:failed",
                record,
                {
                    error,
                }
            );

            logger?.error(
                `Transaction failed: ${record.name}`,
                {
                    transactionId:
                        record.id,

                    state:
                        record.state,

                    error,
                }
            );

            return createPublicSnapshot(
                record
            );
        } finally {
            await runCleanup(
                record,
                options
            );

            activeTransactions.delete(
                record.id
            );

            releaseLock(
                record
            );

            addToHistory(
                record
            );

            updateHealth(
                "finished",
                record
            );
        }
    }

    function isLocked(
        lockKey
    ) {
        try {
            return locks.has(
                normalizeIdentifier(
                    lockKey,
                    "Transaction lock key"
                )
            );
        } catch {
            return false;
        }
    }

    function getActive() {
        return [
            ...activeTransactions
                .values(),
        ].map(
            createPublicSnapshot
        );
    }

    function get(
        transactionId
    ) {
        const id =
            Number(
                transactionId
            );

        if (
            !Number.isSafeInteger(
                id
            )
        ) {
            return null;
        }

        const active =
            activeTransactions.get(
                id
            );

        if (active) {
            return createPublicSnapshot(
                active
            );
        }

        const historical =
            history.find(
                (record) =>
                    record.id === id
            );

        return createPublicSnapshot(
            historical
        );
    }

    function getHistory(
        filters = {}
    ) {
        let results = [
            ...history,
        ];

        if (filters.name) {
            results =
                results.filter(
                    (record) =>
                        record.name ===
                        filters.name
                );
        }

        if (filters.state) {
            results =
                results.filter(
                    (record) =>
                        record.state ===
                        filters.state
                );
        }

        if (filters.lockKey) {
            results =
                results.filter(
                    (record) =>
                        record.lockKey ===
                        filters.lockKey
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

        updateHealth(
            "history-cleared"
        );

        return removed;
    }

    function inspect() {
        return {
            service:
                "transactions",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            activeCount:
                activeTransactions.size,

            lockCount:
                locks.size,

            historyCount:
                history.length,

            active:
                getActive(),

            locks:
                Object.fromEntries(
                    locks.entries()
                ),

            metrics: {
                ...metrics,
            },

            defaults: {
                timeoutMs:
                    DEFAULT_TIMEOUT_MS,

                duplicateCooldownMs:
                    DEFAULT_DUPLICATE_COOLDOWN_MS,

                retryDelayMs:
                    DEFAULT_RETRY_DELAY_MS,

                maximumHistory:
                    MAX_HISTORY,
            },

            states: {
                ...STATES,
            },
        };
    }

    TACTIC.services.transactions = {
        execute,

        isLocked,
        getActive,
        get,
        getHistory,
        clearHistory,
        inspect,

        states:
            STATES,
    };

    health?.register({
        name:
            SERVICE_NAME,

        type:
            health.types.SERVICE,

        status:
            HEALTH_STATES.HEALTHY,

        metadata: {
            serviceName:
                "transactions",

            activeCount:
                0,

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Transaction service loaded"
    );
})();