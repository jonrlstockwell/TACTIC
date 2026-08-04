/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * core/health.js
 *
 * Purpose:
 * Provides centralized runtime-health tracking for the TACTIC
 * framework, services, repositories, UI components, and modules.
 *
 * Responsibilities:
 * - Register health components
 * - Track status, score, activity, errors, and recoveries
 * - Accept optional component heartbeats
 * - Detect stale active components
 * - React to framework error and module events
 * - Provide read-only health snapshots
 *
 * Does NOT:
 * - Restart failed components
 * - Display notifications
 * - Contain module business logic
 *
 * Public API:
 * - register()
 * - unregister()
 * - has()
 * - inspect()
 * - snapshot()
 * - heartbeat()
 * - markHealthy()
 * - markDegraded()
 * - markFailed()
 * - markDisabled()
 * - runChecks()
 * - startMonitoring()
 * - stopMonitoring()
 *
 * Dependencies:
 * - core/constants.js
 * - core/events.js
 * - core/logger.js
 * - core/errors.js
 * - services/scheduler/index.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Health] Namespace is unavailable."
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
        scheduler,
    } = services;

    const {
        EVENTS,
        ERROR_CODES,
        SEVERITY,
        HEALTH_STATES,
        DEFAULTS,
    } = constants;

    const MONITOR_TIMER_NAME =
        "health:monitor";

    const MONITOR_TIMER_GROUP =
        "health";

    const DEFAULT_CHECK_INTERVAL_MS =
        30_000;

    const DEFAULT_STALE_AFTER_MS =
        90_000;

    const MAX_COMPONENT_HISTORY =
        50;

    const COMPONENT_TYPES =
        Object.freeze({
            FRAMEWORK:
                "framework",

            SERVICE:
                "service",

            REPOSITORY:
                "repository",

            UI:
                "ui",

            MODULE:
                "module",
        });

    const components =
        new Map();

    let monitoringStarted =
        false;

    function normalizeType(type) {
        const normalized =
            String(type || "")
                .trim()
                .toLowerCase();

        return Object.values(
            COMPONENT_TYPES
        ).includes(normalized)
            ? normalized
            : COMPONENT_TYPES.SERVICE;
    }

    function normalizeStatus(status) {
        const normalized =
            String(status || "")
                .trim()
                .toLowerCase();

        return Object.values(
            HEALTH_STATES
        ).includes(normalized)
            ? normalized
            : HEALTH_STATES.UNKNOWN;
    }

    function normalizeName(name) {
        if (
            typeof name !== "string" ||
            !name.trim()
        ) {
            throw new TypeError(
                "Health component name must be a non-empty string."
            );
        }

        return name.trim();
    }

    function normalizeScore(score) {
        const numeric =
            Number(score);

        if (
            !Number.isFinite(
                numeric
            )
        ) {
            return DEFAULTS
                .HEALTH_SCORE_MAXIMUM;
        }

        return Math.min(
            DEFAULTS
                .HEALTH_SCORE_MAXIMUM,

            Math.max(
                DEFAULTS
                    .HEALTH_SCORE_MINIMUM,

                Math.round(
                    numeric
                )
            )
        );
    }

    function normalizeMetadata(
        metadata
    ) {
        if (
            metadata &&
            typeof metadata ===
                "object" &&
            !Array.isArray(
                metadata
            )
        ) {
            return {
                ...metadata,
            };
        }

        return {};
    }

    function normalizeStaleAfterMs(
        staleAfterMs,
        fallback =
            DEFAULT_STALE_AFTER_MS
    ) {
        if (
            Number.isFinite(
                staleAfterMs
            ) &&
            staleAfterMs > 0
        ) {
            return Math.floor(
                staleAfterMs
            );
        }

        return fallback;
    }

    function calculateDefaultScore(
        status
    ) {
        switch (status) {
            case HEALTH_STATES.HEALTHY:
                return 100;

            case HEALTH_STATES.STARTING:
            case HEALTH_STATES.RECOVERING:
                return 80;

            case HEALTH_STATES.DEGRADED:
                return 65;

            case HEALTH_STATES.UNHEALTHY:
                return 35;

            case HEALTH_STATES.FAILED:
                return 0;

            /*
             * Disabled and stopped components are intentionally
             * inactive rather than unhealthy.
             */
            case HEALTH_STATES.DISABLED:
            case HEALTH_STATES.STOPPED:
                return 100;

            case HEALTH_STATES.UNKNOWN:
            default:
                return 50;
        }
    }

    function createComponentRecord({
        name,
        type,
        status,
        score,
        staleAfterMs,
        enabled,
        metadata,
    }) {
        const now =
            Date.now();

        const normalizedStatus =
            normalizeStatus(
                status
            );

        return {
            name:
                normalizeName(
                    name
                ),

            type:
                normalizeType(
                    type
                ),

            enabled:
                enabled !== false,

            status:
                normalizedStatus,

            score:
                normalizeScore(
                    score ??
                        calculateDefaultScore(
                            normalizedStatus
                        )
                ),

            registeredAt:
                now,

            updatedAt:
                now,

            lastHeartbeatAt:
                now,

            lastHealthyAt:
                normalizedStatus ===
                HEALTH_STATES.HEALTHY
                    ? now
                    : null,

            lastFailureAt:
                null,

            lastRecoveryAt:
                null,

            staleAfterMs:
                normalizeStaleAfterMs(
                    staleAfterMs
                ),

            stale:
                false,

            consecutiveFailures:
                0,

            errorCount:
                0,

            warningCount:
                0,

            recoveryCount:
                0,

            lastError:
                null,

            lastMessage:
                null,

            metadata:
                normalizeMetadata(
                    metadata
                ),

            history:
                [],
        };
    }

    function addHistoryEntry(
        component,
        action,
        details = {}
    ) {
        component.history.push({
            timestamp:
                Date.now(),

            action:
                String(action),

            status:
                component.status,

            score:
                component.score,

            details: {
                ...details,
            },
        });

        if (
            component.history.length >
            MAX_COMPONENT_HISTORY
        ) {
            component.history.splice(
                0,
                component.history.length -
                    MAX_COMPONENT_HISTORY
            );
        }
    }

    function createPublicSnapshot(
        component
    ) {
        if (!component) {
            return null;
        }

        const now =
            Date.now();

        return {
            name:
                component.name,

            type:
                component.type,

            enabled:
                component.enabled,

            status:
                component.status,

            score:
                component.score,

            registeredAt:
                component.registeredAt,

            updatedAt:
                component.updatedAt,

            millisecondsSinceUpdate:
                now -
                component.updatedAt,

            lastHeartbeatAt:
                component.lastHeartbeatAt,

            millisecondsSinceHeartbeat:
                component.lastHeartbeatAt ===
                null
                    ? null
                    : now -
                      component
                          .lastHeartbeatAt,

            lastHealthyAt:
                component.lastHealthyAt,

            lastFailureAt:
                component.lastFailureAt,

            lastRecoveryAt:
                component.lastRecoveryAt,

            staleAfterMs:
                component.staleAfterMs,

            requiresHeartbeat:
                component.metadata
                    ?.requiresHeartbeat ===
                true,

            stale:
                component.stale,

            consecutiveFailures:
                component
                    .consecutiveFailures,

            errorCount:
                component.errorCount,

            warningCount:
                component.warningCount,

            recoveryCount:
                component.recoveryCount,

            lastError:
                component.lastError
                    ? {
                          ...component
                              .lastError,
                      }
                    : null,

            lastMessage:
                component.lastMessage,

            metadata: {
                ...component.metadata,
            },

            history:
                component.history.map(
                    (entry) => ({
                        ...entry,

                        details: {
                            ...entry.details,
                        },
                    })
                ),
        };
    }

    function emitHealthEvent(
        eventName,
        component,
        previousStatus = null
    ) {
        events?.emit(
            eventName,
            {
                component:
                    createPublicSnapshot(
                        component
                    ),

                previousStatus,
            }
        );
    }

    function register({
        name,
        type =
            COMPONENT_TYPES.SERVICE,

        status =
            HEALTH_STATES.UNKNOWN,

        score = null,

        staleAfterMs =
            DEFAULT_STALE_AFTER_MS,

        enabled = true,

        metadata = {},
    }) {
        const normalizedName =
            normalizeName(
                name
            );

        if (
            components.has(
                normalizedName
            )
        ) {
            const existing =
                components.get(
                    normalizedName
                );

            existing.type =
                normalizeType(
                    type
                );

            existing.enabled =
                enabled !== false;

            existing.staleAfterMs =
                normalizeStaleAfterMs(
                    staleAfterMs,
                    existing.staleAfterMs
                );

            existing.metadata = {
                ...existing.metadata,
                ...normalizeMetadata(
                    metadata
                ),
            };

            existing.updatedAt =
                Date.now();

            addHistoryEntry(
                existing,
                "registration-updated"
            );

            return createPublicSnapshot(
                existing
            );
        }

        const component =
            createComponentRecord({
                name:
                    normalizedName,

                type,
                status,
                score,
                staleAfterMs,
                enabled,
                metadata,
            });

        components.set(
            normalizedName,
            component
        );

        addHistoryEntry(
            component,
            "registered"
        );

        logger?.debug(
            `Health component registered: ${normalizedName}`,
            {
                type:
                    component.type,

                status:
                    component.status,

                requiresHeartbeat:
                    component.metadata
                        ?.requiresHeartbeat ===
                    true,
            }
        );

        emitHealthEvent(
            EVENTS.HEALTH.REGISTERED,
            component
        );

        return createPublicSnapshot(
            component
        );
    }

    function unregister(name) {
        const normalizedName =
            normalizeName(
                name
            );

        return components.delete(
            normalizedName
        );
    }

    function has(name) {
        try {
            return components.has(
                normalizeName(
                    name
                )
            );
        } catch {
            return false;
        }
    }

    function getInternalComponent(
        name
    ) {
        const normalizedName =
            normalizeName(
                name
            );

        return (
            components.get(
                normalizedName
            ) ||
            null
        );
    }

    function ensureComponent(
        name,
        defaults = {}
    ) {
        const normalizedName =
            normalizeName(
                name
            );

        if (
            !components.has(
                normalizedName
            )
        ) {
            register({
                name:
                    normalizedName,

                ...defaults,
            });
        }

        return components.get(
            normalizedName
        );
    }

    function updateComponent(
        name,
        {
            status = null,
            score = null,
            message = null,
            metadata = null,
            error = null,
            action = "updated",
        } = {}
    ) {
        const component =
            ensureComponent(
                name
            );

        const previousStatus =
            component.status;

        if (status !== null) {
            component.status =
                normalizeStatus(
                    status
                );
        }

        component.score =
            normalizeScore(
                score ??
                    calculateDefaultScore(
                        component.status
                    )
            );

        component.updatedAt =
            Date.now();

        if (message !== null) {
            component.lastMessage =
                String(message);
        }

        component.stale =
            false;

        if (metadata) {
            component.metadata = {
                ...component.metadata,
                ...normalizeMetadata(
                    metadata
                ),
            };
        }

        if (error) {
            component.lastError = {
                id:
                    error.id ??
                    null,

                code:
                    error.code ??
                    null,

                severity:
                    error.severity ??
                    null,

                message:
                    error.message ??
                    String(error),

                timestamp:
                    error.timestamp ??
                    Date.now(),
            };
        }

        if (
            component.status ===
            HEALTH_STATES.HEALTHY
        ) {
            component.lastHealthyAt =
                component.updatedAt;

            component
                .consecutiveFailures = 0;
        }

        addHistoryEntry(
            component,
            action,
            {
                previousStatus,

                message:
                    component.lastMessage,
            }
        );

        emitHealthEvent(
            EVENTS.HEALTH.UPDATED,
            component,
            previousStatus
        );

        return {
            component,
            previousStatus,
        };
    }

    function markHealthy(
        name,
        options = {}
    ) {
        const component =
            ensureComponent(
                name,
                options.defaults
            );

        const wasUnhealthy = [
            HEALTH_STATES.DEGRADED,
            HEALTH_STATES.UNHEALTHY,
            HEALTH_STATES.FAILED,
            HEALTH_STATES.RECOVERING,
        ].includes(
            component.status
        );

        const {
            component:
                updatedComponent,
            previousStatus,
        } = updateComponent(
            name,
            {
                status:
                    HEALTH_STATES.HEALTHY,

                score:
                    options.score ??
                    100,

                message:
                    options.message ??
                    "Component is healthy.",

                metadata:
                    options.metadata,

                action:
                    wasUnhealthy
                        ? "recovered"
                        : "healthy",
            }
        );

        updatedComponent.lastHeartbeatAt =
            Date.now();

        updatedComponent.stale =
            false;

        if (wasUnhealthy) {
            updatedComponent
                .lastRecoveryAt =
                Date.now();

            updatedComponent
                .recoveryCount +=
                1;

            emitHealthEvent(
                EVENTS.HEALTH.RECOVERED,
                updatedComponent,
                previousStatus
            );
        }

        return createPublicSnapshot(
            updatedComponent
        );
    }

    function markDegraded(
        name,
        options = {}
    ) {
        const component =
            ensureComponent(
                name,
                options.defaults
            );

        component.warningCount +=
            1;

        const {
            component:
                updatedComponent,
            previousStatus,
        } = updateComponent(
            name,
            {
                status:
                    HEALTH_STATES.DEGRADED,

                score:
                    options.score ??
                    65,

                message:
                    options.message ??
                    "Component health is degraded.",

                metadata:
                    options.metadata,

                error:
                    options.error,

                action:
                    "degraded",
            }
        );

        emitHealthEvent(
            EVENTS.HEALTH.DEGRADED,
            updatedComponent,
            previousStatus
        );

        return createPublicSnapshot(
            updatedComponent
        );
    }

    function markFailed(
        name,
        options = {}
    ) {
        const component =
            ensureComponent(
                name,
                options.defaults
            );

        component.errorCount +=
            1;

        component
            .consecutiveFailures +=
            1;

        component.lastFailureAt =
            Date.now();

        const {
            component:
                updatedComponent,
            previousStatus,
        } = updateComponent(
            name,
            {
                status:
                    options.status ??
                    HEALTH_STATES.FAILED,

                score:
                    options.score ??
                    0,

                message:
                    options.message ??
                    "Component failed.",

                metadata:
                    options.metadata,

                error:
                    options.error,

                action:
                    "failed",
            }
        );

        emitHealthEvent(
            EVENTS.HEALTH.FAILED,
            updatedComponent,
            previousStatus
        );

        return createPublicSnapshot(
            updatedComponent
        );
    }

    function markDisabled(
        name,
        options = {}
    ) {
        const component =
            ensureComponent(
                name,
                options.defaults
            );

        component.enabled =
            false;

        const {
            component:
                updatedComponent,
        } = updateComponent(
            name,
            {
                status:
                    HEALTH_STATES.DISABLED,

                score:
                    100,

                message:
                    options.message ??
                    "Component is disabled.",

                metadata:
                    options.metadata,

                action:
                    "disabled",
            }
        );

        return createPublicSnapshot(
            updatedComponent
        );
    }

    function heartbeat(
        name,
        options = {}
    ) {
        const component =
            ensureComponent(
                name,
                options.defaults
            );

        const wasStale =
            component.stale;

        component.lastHeartbeatAt =
            Date.now();

        component.updatedAt =
            component.lastHeartbeatAt;

        component.stale =
            false;

        if (options.metadata) {
            component.metadata = {
                ...component.metadata,
                ...normalizeMetadata(
                    options.metadata
                ),
            };
        }

        if (
            options.markHealthy ===
            true ||
            wasStale
        ) {
            return markHealthy(
                name,
                {
                    message:
                        options.message ??
                        "Heartbeat received.",

                    metadata:
                        options.metadata,
                }
            );
        }

        addHistoryEntry(
            component,
            "heartbeat"
        );

        return createPublicSnapshot(
            component
        );
    }

    function inspect(
        name = null
    ) {
        if (name !== null) {
            return createPublicSnapshot(
                getInternalComponent(
                    name
                )
            );
        }

        return [
            ...components.values(),
        ]
            .map(
                createPublicSnapshot
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    first.type.localeCompare(
                        second.type
                    ) ||
                    first.name.localeCompare(
                        second.name
                    )
            );
    }

    function calculateOverallStatus(
        componentSnapshots
    ) {
        const activeComponents =
            componentSnapshots.filter(
                (component) =>
                    component.enabled &&
                    ![
                        HEALTH_STATES.DISABLED,
                        HEALTH_STATES.STOPPED,
                    ].includes(
                        component.status
                    )
            );

        if (
            activeComponents.some(
                (component) =>
                    component.status ===
                    HEALTH_STATES.FAILED
            )
        ) {
            return HEALTH_STATES.FAILED;
        }

        if (
            activeComponents.some(
                (component) =>
                    component.status ===
                    HEALTH_STATES.UNHEALTHY
            )
        ) {
            return HEALTH_STATES.UNHEALTHY;
        }

        if (
            activeComponents.some(
                (component) =>
                    component.status ===
                    HEALTH_STATES.DEGRADED
            )
        ) {
            return HEALTH_STATES.DEGRADED;
        }

        if (
            activeComponents.some(
                (component) =>
                    component.status ===
                    HEALTH_STATES.UNKNOWN
            )
        ) {
            return HEALTH_STATES.UNKNOWN;
        }

        if (
            activeComponents.some(
                (component) =>
                    [
                        HEALTH_STATES.STARTING,
                        HEALTH_STATES.RECOVERING,
                    ].includes(
                        component.status
                    )
            )
        ) {
            return HEALTH_STATES.STARTING;
        }

        return HEALTH_STATES.HEALTHY;
    }

    function snapshot() {
        const componentSnapshots =
            inspect();

        const activeComponents =
            componentSnapshots.filter(
                (component) =>
                    component.enabled &&
                    ![
                        HEALTH_STATES.DISABLED,
                        HEALTH_STATES.STOPPED,
                    ].includes(
                        component.status
                    )
            );

        const overallScore =
            activeComponents.length ===
            0
                ? 100
                : Math.round(
                      activeComponents.reduce(
                          (
                              total,
                              component
                          ) =>
                              total +
                              component.score,
                          0
                      ) /
                          activeComponents
                              .length
                  );

        const grouped = {
            framework: [],
            services: [],
            repositories: [],
            ui: [],
            modules: [],
        };

        for (
            const component of
            componentSnapshots
        ) {
            switch (
                component.type
            ) {
                case COMPONENT_TYPES.FRAMEWORK:
                    grouped.framework.push(
                        component
                    );
                    break;

                case COMPONENT_TYPES.REPOSITORY:
                    grouped.repositories.push(
                        component
                    );
                    break;

                case COMPONENT_TYPES.UI:
                    grouped.ui.push(
                        component
                    );
                    break;

                case COMPONENT_TYPES.MODULE:
                    grouped.modules.push(
                        component
                    );
                    break;

                case COMPONENT_TYPES.SERVICE:
                default:
                    grouped.services.push(
                        component
                    );
                    break;
            }
        }

        return {
            timestamp:
                Date.now(),

            overallStatus:
                calculateOverallStatus(
                    componentSnapshots
                ),

            overallScore,

            monitoringStarted,

            componentCount:
                componentSnapshots.length,

            heartbeatComponentCount:
                componentSnapshots.filter(
                    (component) =>
                        component
                            .requiresHeartbeat
                ).length,

            staleCount:
                componentSnapshots.filter(
                    (component) =>
                        component.stale
                ).length,

            failedCount:
                componentSnapshots.filter(
                    (component) =>
                        component.status ===
                        HEALTH_STATES.FAILED
                ).length,

            unhealthyCount:
                componentSnapshots.filter(
                    (component) =>
                        component.status ===
                        HEALTH_STATES.UNHEALTHY
                ).length,

            degradedCount:
                componentSnapshots.filter(
                    (component) =>
                        component.status ===
                        HEALTH_STATES.DEGRADED
                ).length,

            grouped,

            components:
                componentSnapshots,

            errors: {
                total:
                    errors?.count() ||
                    0,

                warnings:
                    errors?.count({
                        severity:
                            SEVERITY.WARNING,
                    }) || 0,

                errors:
                    errors?.count({
                        severity:
                            SEVERITY.ERROR,
                    }) || 0,

                critical:
                    errors?.count({
                        severity:
                            SEVERITY.CRITICAL,
                    }) || 0,
            },
        };
    }

    function runChecks() {
        const now =
            Date.now();

        const checked =
            [];

        for (
            const component of
            components.values()
        ) {
            if (
                !component.enabled ||
                [
                    HEALTH_STATES.DISABLED,
                    HEALTH_STATES.STOPPED,
                ].includes(
                    component.status
                )
            ) {
                continue;
            }

            /*
             * Passive services do not need recurring heartbeats.
             *
             * Storage, Events, Logger, Utilities, and similar
             * services may be perfectly healthy while idle.
             *
             * Stale detection is only enabled when a component
             * explicitly registers:
             *
             * metadata.requiresHeartbeat = true
             */
            if (
                component.metadata
                    ?.requiresHeartbeat !==
                true
            ) {
                checked.push(
                    createPublicSnapshot(
                        component
                    )
                );

                continue;
            }

            const heartbeatAt =
                component.lastHeartbeatAt ??
                component.registeredAt;

            const elapsed =
                now -
                heartbeatAt;

            const stale =
                elapsed >
                component.staleAfterMs;

            if (
                stale &&
                !component.stale
            ) {
                component.stale =
                    true;

                /*
                 * markDegraded() ordinarily resets stale to false,
                 * so the flag is restored after updating status.
                 */
                markDegraded(
                    component.name,
                    {
                        score:
                            Math.min(
                                component.score,
                                50
                            ),

                        message:
                            `No heartbeat received for ${elapsed} ms.`,

                        metadata: {
                            staleForMs:
                                elapsed,

                            lastStaleCheckAt:
                                now,
                        },
                    }
                );

                component.stale =
                    true;

                errors?.report({
                    code:
                        ERROR_CODES
                            .HEALTH
                            .COMPONENT_STALE,

                    severity:
                        SEVERITY.WARNING,

                    service:
                        "health",

                    message:
                        `Health component "${component.name}" is stale.`,

                    details: {
                        component:
                            component.name,

                        type:
                            component.type,

                        staleForMs:
                            elapsed,

                        staleAfterMs:
                            component.staleAfterMs,
                    },

                    recoverable:
                        true,

                    retryable:
                        true,

                    recovery:
                        "Wait for a new component heartbeat.",
                });
            }

            checked.push(
                createPublicSnapshot(
                    component
                )
            );
        }

        const result = {
            timestamp:
                now,

            checkedCount:
                checked.length,

            heartbeatCheckedCount:
                checked.filter(
                    (component) =>
                        component
                            .requiresHeartbeat
                ).length,

            staleCount:
                checked.filter(
                    (component) =>
                        component.stale
                ).length,

            components:
                checked,
        };

        events?.emit(
            EVENTS.HEALTH
                .CHECK_COMPLETED,
            result
        );

        return result;
    }

    function startMonitoring(
        intervalMs =
            DEFAULT_CHECK_INTERVAL_MS
    ) {
        if (
            monitoringStarted
        ) {
            return false;
        }

        if (!scheduler) {
            errors?.report({
                code:
                    ERROR_CODES
                        .HEALTH
                        .CHECK_FAILED,

                severity:
                    SEVERITY.ERROR,

                service:
                    "health",

                message:
                    "Health monitoring could not start because the Scheduler service is unavailable.",

                recoverable:
                    false,
            });

            return false;
        }

        scheduler.every(
            MONITOR_TIMER_NAME,
            intervalMs,
            () => {
                runChecks();
            },
            {
                group:
                    MONITOR_TIMER_GROUP,

                replaceExisting:
                    true,

                continueOnError:
                    true,

                metadata: {
                    service:
                        "health",
                },
            }
        );

        monitoringStarted =
            true;

        logger?.info(
            "Health monitoring started",
            {
                intervalMs,
            }
        );

        return true;
    }

    function stopMonitoring() {
        if (
            !monitoringStarted
        ) {
            return false;
        }

        scheduler?.cancel(
            MONITOR_TIMER_NAME
        );

        monitoringStarted =
            false;

        logger?.info(
            "Health monitoring stopped"
        );

        return true;
    }

    function registerExistingFrameworkComponents() {
        register({
            name:
                "framework:tactic",

            type:
                COMPONENT_TYPES.FRAMEWORK,

            status:
                TACTIC.initialized
                    ? HEALTH_STATES.HEALTHY
                    : HEALTH_STATES.STARTING,

            staleAfterMs:
                120_000,

            metadata: {
                version:
                    TACTIC.version,

                requiresHeartbeat:
                    false,
            },
        });

        const knownServices = [
            "storage",
            "events",
            "logger",
            "utilities",
            "moduleManager",
            "developer",
            "errors",
            "scheduler",
        ];

        for (
            const serviceName of
            knownServices
        ) {
            if (
                services[
                    serviceName
                ]
            ) {
                register({
                    name:
                        `service:${serviceName}`,

                    type:
                        COMPONENT_TYPES.SERVICE,

                    status:
                        HEALTH_STATES.HEALTHY,

                    metadata: {
                        serviceName,

                        /*
                         * These are passive framework services.
                         * They do not require recurring activity.
                         */
                        requiresHeartbeat:
                            false,
                    },
                });
            }
        }

        if (
            services.components
        ) {
            register({
                name:
                    "ui:components",

                type:
                    COMPONENT_TYPES.UI,

                status:
                    HEALTH_STATES.HEALTHY,

                metadata: {
                    requiresHeartbeat:
                        false,
                },
            });
        }

        if (
            services.drawer
        ) {
            register({
                name:
                    "ui:drawer",

                type:
                    COMPONENT_TYPES.UI,

                status:
                    HEALTH_STATES.HEALTHY,

                metadata: {
                    requiresHeartbeat:
                        false,
                },
            });
        }

        for (
            const module of
            TACTIC.modules.values()
        ) {
            register({
                name:
                    `module:${module.id}`,

                type:
                    COMPONENT_TYPES.MODULE,

                status:
                    module.error
                        ? HEALTH_STATES.FAILED
                        : module.initialized
                          ? HEALTH_STATES.HEALTHY
                          : HEALTH_STATES.STARTING,

                metadata: {
                    moduleId:
                        module.id,

                    version:
                        module.version,

                    requiresHeartbeat:
                        false,
                },
            });
        }
    }

    function attachEventListeners() {
        events?.on(
            EVENTS.MODULE.REGISTERED,
            ({
                module,
            }) => {
                register({
                    name:
                        `module:${module.id}`,

                    type:
                        COMPONENT_TYPES.MODULE,

                    status:
                        HEALTH_STATES.STARTING,

                    metadata: {
                        moduleId:
                            module.id,

                        version:
                            module.version,

                        requiresHeartbeat:
                            false,
                    },
                });
            }
        );

        events?.on(
            EVENTS.MODULE.INITIALIZED,
            ({
                module,
            }) => {
                markHealthy(
                    `module:${module.id}`,
                    {
                        message:
                            "Module initialized successfully.",

                        metadata: {
                            initialized:
                                true,
                        },
                    }
                );
            }
        );

        events?.on(
            EVENTS.MODULE.ERROR,
            ({
                module,
                error,
            }) => {
                const moduleId =
                    module?.id ||
                    "unknown";

                markFailed(
                    `module:${moduleId}`,
                    {
                        message:
                            error?.message ||
                            "Module error.",

                        error,
                    }
                );
            }
        );

        events?.on(
            EVENTS.MODULE.UNREGISTERED,
            ({
                id,
            }) => {
                unregister(
                    `module:${id}`
                );
            }
        );

        events?.on(
            EVENTS.ERROR.REPORTED,
            ({
                error,
            }) => {
                /*
                 * A stale-component warning is generated by Health
                 * after the affected component has already been
                 * marked degraded. Do not mark the Health service
                 * itself degraded merely for reporting it.
                 */
                if (
                    error.service ===
                        "health" &&
                    error.code ===
                        ERROR_CODES
                            .HEALTH
                            .COMPONENT_STALE
                ) {
                    return;
                }

                const componentName =
                    error.module
                        ? `module:${error.module}`
                        : error.service
                          ? `service:${error.service}`
                          : "framework:tactic";

                const defaults = {
                    type:
                        error.module
                            ? COMPONENT_TYPES.MODULE
                            : error.service
                              ? COMPONENT_TYPES.SERVICE
                              : COMPONENT_TYPES.FRAMEWORK,

                    metadata: {
                        requiresHeartbeat:
                            false,
                    },
                };

                if (
                    error.severity ===
                    SEVERITY.WARNING
                ) {
                    markDegraded(
                        componentName,
                        {
                            message:
                                error.message,

                            error,

                            defaults,
                        }
                    );

                    return;
                }

                if (
                    [
                        SEVERITY.ERROR,
                        SEVERITY.CRITICAL,
                    ].includes(
                        error.severity
                    )
                ) {
                    markFailed(
                        componentName,
                        {
                            status:
                                error.severity ===
                                SEVERITY.CRITICAL
                                    ? HEALTH_STATES.FAILED
                                    : HEALTH_STATES.UNHEALTHY,

                            score:
                                error.severity ===
                                SEVERITY.CRITICAL
                                    ? 0
                                    : 25,

                            message:
                                error.message,

                            error,

                            defaults,
                        }
                    );
                }
            }
        );

        events?.on(
            EVENTS.APP.READY,
            () => {
                markHealthy(
                    "framework:tactic",
                    {
                        message:
                            "TACTIC is ready.",
                    }
                );
            }
        );

        events?.on(
            EVENTS.APP.ERROR,
            ({
                error,
            }) => {
                markFailed(
                    "framework:tactic",
                    {
                        message:
                            error?.message ||
                            "TACTIC application error.",

                        error,
                    }
                );
            }
        );
    }

    TACTIC.services.health = {
        register,
        unregister,
        has,

        inspect,
        snapshot,

        heartbeat,

        markHealthy,
        markDegraded,
        markFailed,
        markDisabled,

        runChecks,

        startMonitoring,
        stopMonitoring,

        types:
            COMPONENT_TYPES,

        states:
            HEALTH_STATES,
    };

    /*
     * Register the Health service itself after exposing the API.
     */
    register({
        name:
            "service:health",

        type:
            COMPONENT_TYPES.SERVICE,

        status:
            HEALTH_STATES.HEALTHY,

        staleAfterMs:
            120_000,

        metadata: {
            serviceName:
                "health",

            requiresHeartbeat:
                false,
        },
    });

    registerExistingFrameworkComponents();
    attachEventListeners();

    startMonitoring();

    logger?.info(
        "Health service loaded",
        {
            registeredComponents:
                components.size,
        }
    );
})();