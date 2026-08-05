/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/actions/index.js
 *
 * Purpose:
 * Provides a centralized registry and execution service for
 * named framework actions.
 *
 * Responsibilities:
 * - Register named actions
 * - Validate action input
 * - Enforce action capabilities
 * - Execute actions immediately
 * - Enqueue actions through the Job Service
 * - Prevent duplicate active executions
 * - Track action results and execution history
 * - Emit lifecycle events
 * - Expose diagnostics and Health information
 *
 * Does NOT:
 * - Decide when an application should request an action
 * - Grant capabilities
 * - Schedule recurring work
 * - Know Torn selectors unless an action handler uses them
 * - Automatically submit or confirm protected actions
 *
 * Public API:
 * - register()
 * - unregister()
 * - has()
 * - get()
 * - list()
 * - execute()
 * - enqueue()
 * - getActive()
 * - getHistory()
 * - clearHistory()
 * - inspect()
 *
 * Dependencies:
 * - services/capabilities/index.js
 * - services/jobs/index.js
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
            "[TACTIC Actions] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        capabilities,
        jobs,
        events,
        logger,
        errors,
        health,
    } = services;

    const {
        HEALTH_STATES,
    } = constants;

    if (!capabilities) {
        console.error(
            "[TACTIC Actions] Capabilities service is unavailable."
        );

        return;
    }

    const SERVICE_NAME =
        "service:actions";

    const DEFAULT_TIMEOUT_MS =
        30_000;

    const MAX_HISTORY =
        200;

    const STATES =
        Object.freeze({
            PENDING:
                "pending",

            VALIDATING:
                "validating",

            RUNNING:
                "running",

            COMPLETED:
                "completed",

            FAILED:
                "failed",

            TIMED_OUT:
                "timed-out",

            CAPABILITY_DENIED:
                "capability-denied",

            DUPLICATE:
                "duplicate",

            QUEUED:
                "queued",
        });

    const registry =
        new Map();

    const activeExecutions =
        new Map();

    const activeKeys =
        new Map();

    const history =
        [];

    let nextExecutionId =
        1;

    const metrics = {
        startedAt:
            Date.now(),

        registrations:
            0,

        replacements:
            0,

        unregistrations:
            0,

        executionRequests:
            0,

        executionsStarted:
            0,

        completed:
            0,

        failed:
            0,

        timedOut:
            0,

        capabilityDenials:
            0,

        duplicatesSuppressed:
            0,

        queued:
            0,

        validationFailures:
            0,

        historyClears:
            0,

        lastActivityAt:
            Date.now(),

        lastActionId:
            null,

        lastExecutionId:
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

    function normalizeActionId(
        actionId
    ) {
        if (
            typeof actionId !==
                "string" ||
            !actionId.trim()
        ) {
            throw new TypeError(
                "Action ID must be a non-empty string."
            );
        }

        const normalized =
            actionId
                .trim()
                .toLowerCase();

        if (
            !/^[a-z0-9._:-]+$/
                .test(normalized)
        ) {
            throw new TypeError(
                "Action ID contains unsupported characters."
            );
        }

        return normalized;
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

    function normalizeDefinition(
        definition
    ) {
        if (
            !isPlainObject(
                definition
            )
        ) {
            throw new TypeError(
                "Action definition must be an object."
            );
        }

        const id =
            normalizeActionId(
                definition.id ||
                definition.name
            );

        if (
            typeof definition.execute !==
                "function"
        ) {
            throw new TypeError(
                `Action "${id}" requires an execute function.`
            );
        }

        return {
            id,

            name:
                typeof definition.name ===
                    "string" &&
                definition.name.trim()
                    ? definition.name
                          .trim()
                    : id,

            description:
                typeof definition
                    .description ===
                    "string"
                    ? definition
                          .description
                          .trim()
                    : "",

            capability:
                typeof definition
                    .capability ===
                    "string" &&
                definition.capability.trim()
                    ? definition.capability
                          .trim()
                    : null,

            timeoutMs:
                normalizePositiveInteger(
                    definition.timeoutMs,
                    DEFAULT_TIMEOUT_MS
                ),

            suppressConcurrent:
                definition
                    .suppressConcurrent !==
                false,

            validate:
                typeof definition
                    .validate ===
                    "function"
                    ? definition.validate
                    : null,

            execute:
                definition.execute,

            metadata:
                isPlainObject(
                    definition.metadata
                )
                    ? {
                          ...definition.metadata,
                      }
                    : {},

            registeredAt:
                Date.now(),
        };
    }

    function createDefinitionSnapshot(
        definition
    ) {
        if (!definition) {
            return null;
        }

        return {
            id:
                definition.id,

            name:
                definition.name,

            description:
                definition.description,

            capability:
                definition.capability,

            timeoutMs:
                definition.timeoutMs,

            suppressConcurrent:
                definition
                    .suppressConcurrent,

            hasValidator:
                Boolean(
                    definition.validate
                ),

            metadata: {
                ...definition.metadata,
            },

            registeredAt:
                definition.registeredAt,
        };
    }

    function createExecutionRecord(
        definition,
        input,
        options = {}
    ) {
        const now =
            Date.now();

        return {
            id:
                nextExecutionId++,

            actionId:
                definition.id,

            actionName:
                definition.name,

            capability:
                definition.capability,

            state:
                STATES.PENDING,

            createdAt:
                now,

            startedAt:
                null,

            completedAt:
                null,

            durationMs:
                null,

            input:
                cloneValue(
                    input
                ),

            result:
                null,

            error:
                null,

            source:
                typeof options.source ===
                    "string"
                    ? options.source
                    : "direct",

            duplicateKey:
                typeof options
                    .duplicateKey ===
                    "string" &&
                options.duplicateKey.trim()
                    ? options
                          .duplicateKey
                          .trim()
                    : definition.id,

            metadata:
                isPlainObject(
                    options.metadata
                )
                    ? {
                          ...options.metadata,
                      }
                    : {},
        };
    }

    function createExecutionSnapshot(
        record
    ) {
        if (!record) {
            return null;
        }

        return {
            id:
                record.id,

            actionId:
                record.actionId,

            actionName:
                record.actionName,

            capability:
                record.capability,

            state:
                record.state,

            createdAt:
                record.createdAt,

            startedAt:
                record.startedAt,

            completedAt:
                record.completedAt,

            durationMs:
                record.durationMs,

            input:
                cloneValue(
                    record.input
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

            source:
                record.source,

            duplicateKey:
                record.duplicateKey,

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
            metrics.lastActionId =
                record.actionId;

            metrics.lastExecutionId =
                record.id;

            metrics.lastState =
                record.state;
        }

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    actionCount:
                        registry.size,

                    activeCount:
                        activeExecutions
                            .size,

                    historyCount:
                        history.length,

                    lastActionId:
                        metrics
                            .lastActionId,

                    lastExecutionId:
                        metrics
                            .lastExecutionId,

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
                action:
                    createExecutionSnapshot(
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
        history.push(
            record
        );

        trimHistory();
    }

    function register(
        definition,
        options = {}
    ) {
        const normalized =
            normalizeDefinition(
                definition
            );

        const existing =
            registry.get(
                normalized.id
            );

        if (
            existing &&
            options.replace !==
                true
        ) {
            throw new Error(
                `Action "${normalized.id}" is already registered.`
            );
        }

        if (existing) {
            metrics.replacements +=
                1;
        } else {
            metrics.registrations +=
                1;
        }

        registry.set(
            normalized.id,
            normalized
        );

        recordActivity(
            existing
                ? "replace"
                : "register",
            null,
            {
                actionId:
                    normalized.id,
            }
        );

        logger?.debug(
            `Action registered: ${normalized.id}`
        );

        return createDefinitionSnapshot(
            normalized
        );
    }

    function unregister(
        actionId
    ) {
        const id =
            normalizeActionId(
                actionId
            );

        if (
            activeExecutions
                .values()
                .some?.(
                    (record) =>
                        record.actionId ===
                        id
                )
        ) {
            return false;
        }

        const removed =
            registry.delete(
                id
            );

        if (removed) {
            metrics.unregistrations +=
                1;

            recordActivity(
                "unregister",
                null,
                {
                    actionId:
                        id,
                }
            );
        }

        return removed;
    }

    function has(
        actionId
    ) {
        try {
            return registry.has(
                normalizeActionId(
                    actionId
                )
            );
        } catch {
            return false;
        }
    }

    function getInternal(
        actionId
    ) {
        const id =
            normalizeActionId(
                actionId
            );

        return (
            registry.get(
                id
            ) ||
            null
        );
    }

    function get(
        actionId
    ) {
        return createDefinitionSnapshot(
            getInternal(
                actionId
            )
        );
    }

    function list(
        filters = {}
    ) {
        let definitions = [
            ...registry.values(),
        ];

        if (filters.capability) {
            definitions =
                definitions.filter(
                    (definition) =>
                        definition.capability ===
                        filters.capability
                );
        }

        return definitions
            .map(
                (definition) => ({
                    ...createDefinitionSnapshot(
                        definition
                    ),

                    authorized:
                        definition.capability
                            ? capabilities.can(
                                  definition
                                      .capability
                              )
                            : true,
                })
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    first.id.localeCompare(
                        second.id
                    )
            );
    }

    function createTimeoutError(
        definition
    ) {
        const error =
            new Error(
                `Action "${definition.id}" timed out after ${definition.timeoutMs} ms.`
            );

        error.name =
            "ActionTimeoutError";

        return error;
    }

    function withTimeout(
        promise,
        definition
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
                                    definition
                                )
                            );
                        },
                        definition
                            .timeoutMs
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

    function buildHandlerContext(
        record
    ) {
        return {
            action:
                createExecutionSnapshot(
                    record
                ),

            input:
                record.input,

            services:
                TACTIC.services,

            repositories:
                TACTIC.repositories,

            modules:
                TACTIC.modules,

            protection:
                TACTIC.protection,
        };
    }

    async function validateInput(
        definition,
        record
    ) {
        if (!definition.validate) {
            return {
                valid:
                    true,

                input:
                    record.input,
            };
        }

        record.state =
            STATES.VALIDATING;

        const validation =
            await definition.validate(
                buildHandlerContext(
                    record
                )
            );

        if (validation === false) {
            throw new Error(
                `Action "${definition.id}" validation failed.`
            );
        }

        if (
            isPlainObject(
                validation
            ) &&
            validation.valid ===
                false
        ) {
            throw new Error(
                validation.message ||
                `Action "${definition.id}" validation failed.`
            );
        }

        if (
            isPlainObject(
                validation
            ) &&
            Object.prototype
                .hasOwnProperty
                .call(
                    validation,
                    "input"
                )
        ) {
            record.input =
                cloneValue(
                    validation.input
                );
        }

        return validation;
    }

    function findActiveDuplicate(
        duplicateKey
    ) {
        const executionId =
            activeKeys.get(
                duplicateKey
            );

        if (
            !Number.isSafeInteger(
                executionId
            )
        ) {
            return null;
        }

        return (
            activeExecutions.get(
                executionId
            ) ||
            null
        );
    }

    async function execute(
        actionId,
        input = {},
        options = {}
    ) {
        metrics.executionRequests +=
            1;

        const definition =
            getInternal(
                actionId
            );

        if (!definition) {
            throw new Error(
                `Action "${String(actionId)}" is not registered.`
            );
        }

        const record =
            createExecutionRecord(
                definition,
                input,
                options
            );

        if (
            definition
                .suppressConcurrent
        ) {
            const duplicate =
                findActiveDuplicate(
                    record.duplicateKey
                );

            if (duplicate) {
                record.state =
                    STATES.DUPLICATE;

                record.completedAt =
                    Date.now();

                record.durationMs =
                    0;

                record.result = {
                    activeExecutionId:
                        duplicate.id,
                };

                metrics
                    .duplicatesSuppressed +=
                    1;

                addToHistory(
                    record
                );

                recordActivity(
                    "duplicate-suppressed",
                    record
                );

                emit(
                    "action:duplicate",
                    record,
                    {
                        activeAction:
                            createExecutionSnapshot(
                                duplicate
                            ),
                    }
                );

                return createExecutionSnapshot(
                    record
                );
            }
        }

        if (definition.capability) {
            const decision =
                capabilities.explain(
                    definition.capability
                );

            if (!decision.allowed) {
                record.state =
                    STATES
                        .CAPABILITY_DENIED;

                record.error = {
                    name:
                        "CapabilityDeniedError",

                    message:
                        `Capability "${definition.capability}" is not authorized.`,

                    reason:
                        decision.reason,
                };

                record.completedAt =
                    Date.now();

                record.durationMs =
                    0;

                metrics.capabilityDenials +=
                    1;

                addToHistory(
                    record
                );

                recordActivity(
                    "capability-denied",
                    record
                );

                emit(
                    "action:capability-denied",
                    record,
                    {
                        decision,
                    }
                );

                return createExecutionSnapshot(
                    record
                );
            }
        }

        record.startedAt =
            Date.now();

        record.state =
            STATES.RUNNING;

        activeExecutions.set(
            record.id,
            record
        );

        activeKeys.set(
            record.duplicateKey,
            record.id
        );

        metrics.executionsStarted +=
            1;

        emit(
            "action:started",
            record
        );

        recordActivity(
            "started",
            record
        );

        logger?.debug(
            `Action started: ${definition.id}`,
            {
                executionId:
                    record.id,
            }
        );

        try {
            await validateInput(
                definition,
                record
            );

            record.state =
                STATES.RUNNING;

            const result =
                await withTimeout(
                    definition.execute(
                        buildHandlerContext(
                            record
                        )
                    ),
                    definition
                );

            record.result =
                cloneValue(
                    result
                );

            record.state =
                STATES.COMPLETED;

            metrics.completed +=
                1;

            emit(
                "action:completed",
                record
            );

            logger?.debug(
                `Action completed: ${definition.id}`,
                {
                    executionId:
                        record.id,
                }
            );
        } catch (error) {
            const timedOut =
                error?.name ===
                "ActionTimeoutError";

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

            if (
                record.state ===
                    STATES.FAILED &&
                record.state !==
                    STATES.VALIDATING
            ) {
                metrics.validationFailures +=
                    0;
            }

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
                    "actions",

                message:
                    `Action "${definition.id}" failed: ${error.message}`,

                details: {
                    actionId:
                        definition.id,

                    executionId:
                        record.id,

                    state:
                        record.state,

                    capability:
                        definition.capability,
                },

                error,

                recoverable:
                    true,

                retryable:
                    false,

                recovery:
                    "Review the action input and its dependent services before retrying.",
            });

            emit(
                "action:failed",
                record,
                {
                    error,
                }
            );

            logger?.error(
                `Action failed: ${definition.id}`,
                {
                    executionId:
                        record.id,

                    error,
                }
            );
        } finally {
            record.completedAt =
                Date.now();

            record.durationMs =
                record.startedAt
                    ? record.completedAt -
                      record.startedAt
                    : 0;

            activeExecutions.delete(
                record.id
            );

            if (
                activeKeys.get(
                    record.duplicateKey
                ) === record.id
            ) {
                activeKeys.delete(
                    record.duplicateKey
                );
            }

            addToHistory(
                record
            );

            recordActivity(
                "finished",
                record
            );
        }

        return createExecutionSnapshot(
            record
        );
    }

    function enqueue(
        actionId,
        input = {},
        options = {}
    ) {
        if (!jobs) {
            throw new Error(
                "Job Service is unavailable."
            );
        }

        const definition =
            getInternal(
                actionId
            );

        if (!definition) {
            throw new Error(
                `Action "${String(actionId)}" is not registered.`
            );
        }

        const normalizedId =
            definition.id;

        const job =
            jobs.enqueue({
                name:
                    options.jobName ||
                    `action:${normalizedId}`,

                priority:
                    options.priority ||
                    "normal",

                delayMs:
                    options.delayMs ??
                    options.delay ??
                    0,

                timeoutMs:
                    options.timeoutMs ||
                    definition.timeoutMs,

                retries:
                    options.retries ||
                    0,

                retryDelayMs:
                    options.retryDelayMs ||
                    1000,

                duplicateKey:
                    options.duplicateKey ||
                    `action:${normalizedId}`,

                duplicateWindowMs:
                    options
                        .duplicateWindowMs ||
                    0,

                suppressQueuedDuplicates:
                    options
                        .suppressQueuedDuplicates !==
                    false,

                capability:
                    definition.capability,

                context: {
                    actionId:
                        normalizedId,

                    input:
                        cloneValue(
                            input
                        ),
                },

                metadata: {
                    type:
                        "action",

                    actionId:
                        normalizedId,

                    ...(isPlainObject(
                        options.metadata
                    )
                        ? options.metadata
                        : {}),
                },

                async execute({
                    context,
                }) {
                    const actionResult =
                        await execute(
                            context.actionId,
                            context.input,
                            {
                                source:
                                    "job",

                                duplicateKey:
                                    options
                                        .actionDuplicateKey ||
                                    context
                                        .actionId,

                                metadata: {
                                    jobExecution:
                                        true,
                                },
                            }
                        );

                    if (
                        ![
                            STATES.COMPLETED,
                            STATES.DUPLICATE,
                        ].includes(
                            actionResult.state
                        )
                    ) {
                        const error =
                            new Error(
                                actionResult
                                    .error
                                    ?.message ||
                                `Action "${context.actionId}" did not complete.`
                            );

                        error.name =
                            actionResult
                                .error
                                ?.name ||
                            "ActionExecutionError";

                        throw error;
                    }

                    return actionResult;
                },
            });

        metrics.queued +=
            1;

        recordActivity(
            "queued",
            null,
            {
                actionId:
                    normalizedId,

                jobId:
                    job.id,
            }
        );

        return {
            actionId:
                normalizedId,

            state:
                STATES.QUEUED,

            job,
        };
    }

    function getActive() {
        return [
            ...activeExecutions.values(),
        ].map(
            createExecutionSnapshot
        );
    }

    function getHistory(
        filters = {}
    ) {
        let results = [
            ...history,
        ];

        if (filters.actionId) {
            const actionId =
                normalizeActionId(
                    filters.actionId
                );

            results =
                results.filter(
                    (record) =>
                        record.actionId ===
                        actionId
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
            createExecutionSnapshot
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
        const actions =
            list();

        return {
            service:
                "actions",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            actionCount:
                registry.size,

            activeCount:
                activeExecutions.size,

            historyCount:
                history.length,

            authorizedCount:
                actions.filter(
                    (action) =>
                        action.authorized
                ).length,

            deniedCount:
                actions.filter(
                    (action) =>
                        !action.authorized
                ).length,

            actions,

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

            states: {
                ...STATES,
            },

            defaults: {
                timeoutMs:
                    DEFAULT_TIMEOUT_MS,

                maximumHistory:
                    MAX_HISTORY,
            },
        };
    }

    TACTIC.services.actions =
        Object.freeze({
            register,
            unregister,

            has,
            get,
            list,

            execute,
            enqueue,

            getActive,
            getHistory,
            clearHistory,

            inspect,

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
                "actions",

            actionCount:
                0,

            jobIntegration:
                Boolean(
                    jobs
                ),

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Action service loaded"
    );
})();