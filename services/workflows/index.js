/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/workflows/index.js
 *
 * Purpose:
 * Provides centralized registration and sequential execution of
 * multi-step framework workflows.
 *
 * Responsibilities:
 * - Register named workflow definitions
 * - Execute workflow steps sequentially
 * - Carry shared context between steps
 * - Support logic and Action steps
 * - Support conditional step execution
 * - Enforce workflow capabilities
 * - Support cancellation between steps
 * - Track workflow and step history
 * - Emit lifecycle events
 * - Expose diagnostics and Health information
 *
 * Does NOT:
 * - Persist unfinished workflows across page reloads
 * - Resume workflows after navigation
 * - Directly manipulate Torn pages
 * - Bypass Action capability checks
 * - Schedule recurring execution
 *
 * Public API:
 * - register()
 * - unregister()
 * - has()
 * - get()
 * - list()
 * - execute()
 * - cancel()
 * - getActive()
 * - getHistory()
 * - clearHistory()
 * - inspect()
 *
 * Dependencies:
 * - services/actions/index.js
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
            "[TACTIC Workflows] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        actions,
        capabilities,
        events,
        logger,
        errors,
        health,
    } = services;

    const {
        HEALTH_STATES,
    } = constants;

    if (!actions) {
        console.error(
            "[TACTIC Workflows] Action service is unavailable."
        );

        return;
    }

    if (!capabilities) {
        console.error(
            "[TACTIC Workflows] Capabilities service is unavailable."
        );

        return;
    }

    const SERVICE_NAME =
        "service:workflows";

    const DEFAULT_TIMEOUT_MS =
        60_000;

    const MAX_HISTORY =
        200;

    const WORKFLOW_STATES =
        Object.freeze({
            PENDING:
                "pending",

            RUNNING:
                "running",

            COMPLETED:
                "completed",

            FAILED:
                "failed",

            TIMED_OUT:
                "timed-out",

            CANCELLED:
                "cancelled",

            CAPABILITY_DENIED:
                "capability-denied",

            DUPLICATE:
                "duplicate",
        });

    const STEP_STATES =
        Object.freeze({
            PENDING:
                "pending",

            RUNNING:
                "running",

            COMPLETED:
                "completed",

            SKIPPED:
                "skipped",

            FAILED:
                "failed",

            CANCELLED:
                "cancelled",
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

        cancelled:
            0,

        capabilityDenials:
            0,

        duplicatesSuppressed:
            0,

        stepsStarted:
            0,

        stepsCompleted:
            0,

        stepsSkipped:
            0,

        stepsFailed:
            0,

        historyClears:
            0,

        lastActivityAt:
            Date.now(),

        lastWorkflowId:
            null,

        lastExecutionId:
            null,

        lastState:
            null,

        lastStepId:
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
            value
                .trim()
                .toLowerCase();

        if (
            !/^[a-z0-9._:-]+$/
                .test(normalized)
        ) {
            throw new TypeError(
                `${label} contains unsupported characters.`
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

    function normalizeStep(
        step,
        index
    ) {
        if (
            !isPlainObject(
                step
            )
        ) {
            throw new TypeError(
                `Workflow step ${index + 1} must be an object.`
            );
        }

        const id =
            normalizeIdentifier(
                step.id ||
                `step-${index + 1}`,
                "Workflow step ID"
            );

        const hasRun =
            typeof step.run ===
            "function";

        const hasAction =
            typeof step.action ===
                "string" &&
            step.action.trim();

        if (
            !hasRun &&
            !hasAction
        ) {
            throw new TypeError(
                `Workflow step "${id}" requires either run() or an action ID.`
            );
        }

        if (
            hasRun &&
            hasAction
        ) {
            throw new TypeError(
                `Workflow step "${id}" cannot define both run() and action.`
            );
        }

        return {
            id,

            name:
                typeof step.name ===
                    "string" &&
                step.name.trim()
                    ? step.name.trim()
                    : id,

            type:
                hasAction
                    ? "action"
                    : "logic",

            action:
                hasAction
                    ? normalizeIdentifier(
                          step.action,
                          "Action ID"
                      )
                    : null,

            run:
                hasRun
                    ? step.run
                    : null,

            when:
                typeof step.when ===
                    "function"
                    ? step.when
                    : null,

            input:
                typeof step.input ===
                    "function"
                    ? step.input
                    : null,

            continueOnFalseResult:
                step
                    .continueOnFalseResult ===
                true,

            metadata:
                isPlainObject(
                    step.metadata
                )
                    ? {
                          ...step.metadata,
                      }
                    : {},
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
                "Workflow definition must be an object."
            );
        }

        const id =
            normalizeIdentifier(
                definition.id ||
                definition.name,
                "Workflow ID"
            );

        if (
            !Array.isArray(
                definition.steps
            ) ||
            definition.steps.length ===
                0
        ) {
            throw new TypeError(
                `Workflow "${id}" requires at least one step.`
            );
        }

        const steps =
            definition.steps.map(
                normalizeStep
            );

        const stepIds =
            new Set();

        for (
            const step of
            steps
        ) {
            if (
                stepIds.has(
                    step.id
                )
            ) {
                throw new Error(
                    `Workflow "${id}" contains duplicate step ID "${step.id}".`
                );
            }

            stepIds.add(
                step.id
            );
        }

        return {
            id,

            name:
                typeof definition.name ===
                    "string" &&
                definition.name.trim()
                    ? definition.name.trim()
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
                    ? definition
                          .capability
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

            createContext:
                typeof definition
                    .createContext ===
                    "function"
                    ? definition
                          .createContext
                    : null,

            steps,

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

            hasContextFactory:
                Boolean(
                    definition
                        .createContext
                ),

            steps:
                definition.steps.map(
                    (step) => ({
                        id:
                            step.id,

                        name:
                            step.name,

                        type:
                            step.type,

                        action:
                            step.action,

                        hasCondition:
                            Boolean(
                                step.when
                            ),

                        hasInputFactory:
                            Boolean(
                                step.input
                            ),

                        metadata: {
                            ...step.metadata,
                        },
                    })
                ),

            metadata: {
                ...definition.metadata,
            },

            registeredAt:
                definition.registeredAt,
        };
    }

    function createStepRecord(
        step
    ) {
        return {
            id:
                step.id,

            name:
                step.name,

            type:
                step.type,

            action:
                step.action,

            state:
                STEP_STATES.PENDING,

            startedAt:
                null,

            completedAt:
                null,

            durationMs:
                null,

            result:
                null,

            error:
                null,

            skipReason:
                null,

            metadata: {
                ...step.metadata,
            },
        };
    }

    function createExecutionRecord(
        definition,
        input,
        context,
        options = {}
    ) {
        const now =
            Date.now();

        return {
            id:
                nextExecutionId++,

            workflowId:
                definition.id,

            workflowName:
                definition.name,

            capability:
                definition.capability,

            state:
                WORKFLOW_STATES.PENDING,

            createdAt:
                now,

            startedAt:
                null,

            completedAt:
                null,

            durationMs:
                null,

            currentStepId:
                null,

            cancelRequested:
                false,

            input:
                cloneValue(
                    input
                ),

            context,

            result:
                null,

            error:
                null,

            steps:
                definition.steps.map(
                    createStepRecord
                ),

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

    function createStepSnapshot(
        step
    ) {
        return {
            id:
                step.id,

            name:
                step.name,

            type:
                step.type,

            action:
                step.action,

            state:
                step.state,

            startedAt:
                step.startedAt,

            completedAt:
                step.completedAt,

            durationMs:
                step.durationMs,

            result:
                cloneValue(
                    step.result
                ),

            error:
                step.error
                    ? {
                          ...step.error,
                      }
                    : null,

            skipReason:
                step.skipReason,

            metadata: {
                ...step.metadata,
            },
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

            workflowId:
                record.workflowId,

            workflowName:
                record.workflowName,

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

            currentStepId:
                record.currentStepId,

            cancelRequested:
                record.cancelRequested,

            input:
                cloneValue(
                    record.input
                ),

            context:
                cloneValue(
                    record.context
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

            steps:
                record.steps.map(
                    createStepSnapshot
                ),

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
            metrics.lastWorkflowId =
                record.workflowId;

            metrics.lastExecutionId =
                record.id;

            metrics.lastState =
                record.state;

            metrics.lastStepId =
                record.currentStepId;
        }

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    workflowCount:
                        registry.size,

                    activeCount:
                        activeExecutions
                            .size,

                    historyCount:
                        history.length,

                    lastWorkflowId:
                        metrics
                            .lastWorkflowId,

                    lastExecutionId:
                        metrics
                            .lastExecutionId,

                    lastState:
                        metrics.lastState,

                    lastStepId:
                        metrics.lastStepId,

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
                workflow:
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
                `Workflow "${normalized.id}" is already registered.`
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
                workflowId:
                    normalized.id,
            }
        );

        logger?.debug(
            `Workflow registered: ${normalized.id}`
        );

        return createDefinitionSnapshot(
            normalized
        );
    }

    function unregister(
        workflowId
    ) {
        const id =
            normalizeIdentifier(
                workflowId,
                "Workflow ID"
            );

        const isActive = [
            ...activeExecutions
                .values(),
        ].some(
            (record) =>
                record.workflowId ===
                id
        );

        if (isActive) {
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
                    workflowId:
                        id,
                }
            );
        }

        return removed;
    }

    function has(
        workflowId
    ) {
        try {
            return registry.has(
                normalizeIdentifier(
                    workflowId,
                    "Workflow ID"
                )
            );
        } catch {
            return false;
        }
    }

    function getInternal(
        workflowId
    ) {
        const id =
            normalizeIdentifier(
                workflowId,
                "Workflow ID"
            );

        return (
            registry.get(
                id
            ) ||
            null
        );
    }

    function get(
        workflowId
    ) {
        return createDefinitionSnapshot(
            getInternal(
                workflowId
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
                `Workflow "${definition.id}" timed out after ${definition.timeoutMs} ms.`
            );

        error.name =
            "WorkflowTimeoutError";

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
                        definition.timeoutMs
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

    function createHandlerContext(
        record,
        step = null
    ) {
        return {
            workflow:
                createExecutionSnapshot(
                    record
                ),

            step:
                step
                    ? createStepSnapshot(
                          step
                      )
                    : null,

            input:
                record.input,

            context:
                record.context,

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
                            `Workflow "${record.workflowId}" was cancelled.`
                        );

                    error.name =
                        "WorkflowCancelledError";

                    throw error;
                }
            },

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

    async function createInitialContext(
        definition,
        input
    ) {
        if (
            !definition
                .createContext
        ) {
            return {};
        }

        const created =
            await definition
                .createContext({
                    input:
                        cloneValue(
                            input
                        ),

                    services:
                        TACTIC.services,

                    repositories:
                        TACTIC.repositories,

                    modules:
                        TACTIC.modules,

                    protection:
                        TACTIC.protection,
                });

        return isPlainObject(
            created
        )
            ? created
            : {};
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

    async function runStep(
        definition,
        record,
        stepDefinition,
        stepRecord
    ) {
        record.currentStepId =
            stepDefinition.id;

        metrics.lastStepId =
            stepDefinition.id;

        if (
            record.cancelRequested
        ) {
            const error =
                new Error(
                    `Workflow "${record.workflowId}" was cancelled.`
                );

            error.name =
                "WorkflowCancelledError";

            throw error;
        }

        if (
            stepDefinition.when
        ) {
            const shouldRun =
                await stepDefinition
                    .when(
                        createHandlerContext(
                            record,
                            stepRecord
                        )
                    );

            if (!shouldRun) {
                stepRecord.state =
                    STEP_STATES.SKIPPED;

                stepRecord.completedAt =
                    Date.now();

                stepRecord.durationMs =
                    0;

                stepRecord.skipReason =
                    "condition-false";

                metrics.stepsSkipped +=
                    1;

                emit(
                    "workflow:step-skipped",
                    record,
                    {
                        step:
                            createStepSnapshot(
                                stepRecord
                            ),
                    }
                );

                recordActivity(
                    "step-skipped",
                    record
                );

                return {
                    skipped:
                        true,
                };
            }
        }

        stepRecord.state =
            STEP_STATES.RUNNING;

        stepRecord.startedAt =
            Date.now();

        metrics.stepsStarted +=
            1;

        emit(
            "workflow:step-started",
            record,
            {
                step:
                    createStepSnapshot(
                        stepRecord
                    ),
            }
        );

        recordActivity(
            "step-started",
            record
        );

        try {
            let result;

            if (
                stepDefinition.type ===
                "logic"
            ) {
                result =
                    await stepDefinition
                        .run(
                            createHandlerContext(
                                record,
                                stepRecord
                            )
                        );
            } else {
                let actionInput =
                    {};

                if (
                    stepDefinition.input
                ) {
                    actionInput =
                        await stepDefinition
                            .input(
                                createHandlerContext(
                                    record,
                                    stepRecord
                                )
                            );
                }

                const actionResult =
                    await actions.execute(
                        stepDefinition.action,
                        actionInput,
                        {
                            source:
                                `workflow:${definition.id}`,

                            duplicateKey:
                                `${record.duplicateKey}:${stepDefinition.id}`,

                            metadata: {
                                workflowId:
                                    definition.id,

                                workflowExecutionId:
                                    record.id,

                                workflowStepId:
                                    stepDefinition.id,
                            },
                        }
                    );

                if (
                    ![
                        actions.states
                            .COMPLETED,

                        actions.states
                            .DUPLICATE,
                    ].includes(
                        actionResult.state
                    )
                ) {
                    const error =
                        new Error(
                            actionResult.error
                                ?.message ||
                            `Action "${stepDefinition.action}" did not complete.`
                        );

                    error.name =
                        actionResult.error
                            ?.name ||
                        "WorkflowActionError";

                    throw error;
                }

                result =
                    actionResult;
            }

            if (
                result === false &&
                !stepDefinition
                    .continueOnFalseResult
            ) {
                throw new Error(
                    `Workflow step "${stepDefinition.id}" returned false.`
                );
            }

            stepRecord.result =
                cloneValue(
                    result
                );

            stepRecord.state =
                STEP_STATES.COMPLETED;

            stepRecord.completedAt =
                Date.now();

            stepRecord.durationMs =
                stepRecord.completedAt -
                stepRecord.startedAt;

            metrics.stepsCompleted +=
                1;

            emit(
                "workflow:step-completed",
                record,
                {
                    step:
                        createStepSnapshot(
                            stepRecord
                        ),
                }
            );

            recordActivity(
                "step-completed",
                record
            );

            return result;
        } catch (error) {
            stepRecord.state =
                STEP_STATES.FAILED;

            stepRecord.completedAt =
                Date.now();

            stepRecord.durationMs =
                stepRecord.startedAt
                    ? stepRecord.completedAt -
                      stepRecord.startedAt
                    : 0;

            stepRecord.error =
                createErrorSnapshot(
                    error
                );

            metrics.stepsFailed +=
                1;

            emit(
                "workflow:step-failed",
                record,
                {
                    step:
                        createStepSnapshot(
                            stepRecord
                        ),

                    error,
                }
            );

            recordActivity(
                "step-failed",
                record
            );

            throw error;
        }
    }

    async function execute(
        workflowId,
        input = {},
        options = {}
    ) {
        metrics.executionRequests +=
            1;

        const definition =
            getInternal(
                workflowId
            );

        if (!definition) {
            throw new Error(
                `Workflow "${String(workflowId)}" is not registered.`
            );
        }

        const context =
            await createInitialContext(
                definition,
                input
            );

        const record =
            createExecutionRecord(
                definition,
                input,
                context,
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
                    WORKFLOW_STATES
                        .DUPLICATE;

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
                    "workflow:duplicate",
                    record,
                    {
                        activeWorkflow:
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
                    WORKFLOW_STATES
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
                    "workflow:capability-denied",
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
            WORKFLOW_STATES.RUNNING;

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
            "workflow:started",
            record
        );

        recordActivity(
            "started",
            record
        );

        logger?.debug(
            `Workflow started: ${definition.id}`,
            {
                executionId:
                    record.id,
            }
        );

        try {
            const executeSteps =
                async () => {
                    let lastResult =
                        null;

                    for (
                        let index = 0;
                        index <
                        definition.steps
                            .length;
                        index += 1
                    ) {
                        const stepDefinition =
                            definition.steps[
                                index
                            ];

                        const stepRecord =
                            record.steps[
                                index
                            ];

                        lastResult =
                            await runStep(
                                definition,
                                record,
                                stepDefinition,
                                stepRecord
                            );
                    }

                    return lastResult;
                };

            record.result =
                cloneValue(
                    await withTimeout(
                        executeSteps(),
                        definition
                    )
                );

            record.state =
                WORKFLOW_STATES
                    .COMPLETED;

            metrics.completed +=
                1;

            emit(
                "workflow:completed",
                record
            );

            logger?.debug(
                `Workflow completed: ${definition.id}`,
                {
                    executionId:
                        record.id,
                }
            );
        } catch (error) {
            if (
                error?.name ===
                "WorkflowCancelledError"
            ) {
                record.state =
                    WORKFLOW_STATES
                        .CANCELLED;

                metrics.cancelled +=
                    1;

                const pendingSteps =
                    record.steps.filter(
                        (step) =>
                            step.state ===
                            STEP_STATES
                                .PENDING
                    );

                for (
                    const step of
                    pendingSteps
                ) {
                    step.state =
                        STEP_STATES
                            .CANCELLED;
                }

                emit(
                    "workflow:cancelled",
                    record
                );
            } else {
                const timedOut =
                    error?.name ===
                    "WorkflowTimeoutError";

                record.state =
                    timedOut
                        ? WORKFLOW_STATES
                              .TIMED_OUT
                        : WORKFLOW_STATES
                              .FAILED;

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
                        "workflows",

                    message:
                        `Workflow "${definition.id}" failed: ${error.message}`,

                    details: {
                        workflowId:
                            definition.id,

                        executionId:
                            record.id,

                        currentStepId:
                            record
                                .currentStepId,

                        capability:
                            definition
                                .capability,
                    },

                    error,

                    recoverable:
                        true,

                    retryable:
                        false,

                    recovery:
                        "Review the workflow context, failed step, and dependent Actions before retrying.",
                });

                emit(
                    "workflow:failed",
                    record,
                    {
                        error,
                    }
                );

                logger?.error(
                    `Workflow failed: ${definition.id}`,
                    {
                        executionId:
                            record.id,

                        currentStepId:
                            record
                                .currentStepId,

                        error,
                    }
                );
            }
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

    function cancel(
        executionId
    ) {
        const id =
            Number(
                executionId
            );

        if (
            !Number.isSafeInteger(
                id
            )
        ) {
            return false;
        }

        const record =
            activeExecutions.get(
                id
            );

        if (!record) {
            return false;
        }

        record.cancelRequested =
            true;

        recordActivity(
            "cancel-requested",
            record
        );

        return true;
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

        if (filters.workflowId) {
            const workflowId =
                normalizeIdentifier(
                    filters.workflowId,
                    "Workflow ID"
                );

            results =
                results.filter(
                    (record) =>
                        record.workflowId ===
                        workflowId
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
        const workflows =
            list();

        return {
            service:
                "workflows",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            workflowCount:
                registry.size,

            activeCount:
                activeExecutions.size,

            historyCount:
                history.length,

            authorizedCount:
                workflows.filter(
                    (workflow) =>
                        workflow.authorized
                ).length,

            deniedCount:
                workflows.filter(
                    (workflow) =>
                        !workflow.authorized
                ).length,

            workflows,

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

            workflowStates: {
                ...WORKFLOW_STATES,
            },

            stepStates: {
                ...STEP_STATES,
            },

            defaults: {
                timeoutMs:
                    DEFAULT_TIMEOUT_MS,

                maximumHistory:
                    MAX_HISTORY,
            },
        };
    }

    TACTIC.services.workflows =
        Object.freeze({
            register,
            unregister,

            has,
            get,
            list,

            execute,
            cancel,

            getActive,
            getHistory,
            clearHistory,

            inspect,

            states:
                WORKFLOW_STATES,

            stepStates:
                STEP_STATES,
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
                "workflows",

            workflowCount:
                0,

            persistentWorkflows:
                false,

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Workflow service loaded"
    );
})();