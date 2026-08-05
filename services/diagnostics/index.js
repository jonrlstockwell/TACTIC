/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/diagnostics/index.js
 *
 * Purpose:
 * Provides one centralized, read-only diagnostic snapshot of
 * the current TACTIC runtime.
 *
 * Responsibilities:
 * - Collect framework and lifecycle information
 * - Collect Health information
 * - Inspect registered services
 * - Inspect repositories and modules
 * - Aggregate State, Jobs, Actions, and Workflows
 * - Expose recent errors, logs, events, timers, and observers
 * - Provide safe, isolated diagnostic reads
 * - Expose Health and service metrics
 *
 * Does NOT:
 * - Modify service state
 * - Execute actions, jobs, or workflows
 * - Clear errors or logs
 * - Restart framework components
 * - Persist diagnostic snapshots
 *
 * Public API:
 * - snapshot()
 * - inspectService()
 * - inspectRepository()
 * - inspectModule()
 * - listInspectableServices()
 * - inspect()
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Diagnostics] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        logger,
        health,
    } = services;

    const {
        HEALTH_STATES,
    } = constants;

    const SERVICE_NAME =
        "service:diagnostics";

    const metrics = {
        startedAt:
            Date.now(),

        snapshots:
            0,

        serviceInspections:
            0,

        repositoryInspections:
            0,

        moduleInspections:
            0,

        inspectionFailures:
            0,

        lastSnapshotAt:
            null,

        lastActivityAt:
            Date.now(),

        lastTarget:
            null,

        lastError:
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

    function createErrorSnapshot(
        error
    ) {
        return {
            name:
                error?.name ||
                "Error",

            message:
                error?.message ||
                String(error),

            timestamp:
                Date.now(),
        };
    }

    function safelyRead(
        reader,
        fallback = null,
        target =
            "unknown"
    ) {
        try {
            const result =
                reader();

            return result ??
                fallback;
        } catch (error) {
            metrics
                .inspectionFailures +=
                1;

            metrics.lastTarget =
                target;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.warn(
                `Diagnostics inspection failed: ${target}`,
                {
                    error,
                }
            );

            return fallback;
        }
    }

    function recordActivity(
        operation,
        target = null
    ) {
        metrics.lastActivityAt =
            Date.now();

        metrics.lastTarget =
            target;

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    lastTarget:
                        target,

                    snapshots:
                        metrics.snapshots,

                    inspectionFailures:
                        metrics
                            .inspectionFailures,
                },
            }
        );
    }

    function listInspectableServices() {
        return Object.entries(
            services
        )
            .filter(
                ([
                    ,
                    service,
                ]) =>
                    service &&
                    typeof service
                        .inspect ===
                    "function"
            )
            .map(
                ([
                    name,
                ]) =>
                    name
            )
            .sort();
    }

    function inspectService(
        serviceName
    ) {
        metrics.serviceInspections +=
            1;

        const normalizedName =
            String(
                serviceName ||
                ""
            ).trim();

        if (!normalizedName) {
            return null;
        }

        const service =
            services[
                normalizedName
            ];

        if (
            !service ||
            typeof service.inspect !==
                "function"
        ) {
            return null;
        }

        const result =
            safelyRead(
                () =>
                    service.inspect(),
                null,
                `service:${normalizedName}`
            );

        recordActivity(
            "inspect-service",
            normalizedName
        );

        return cloneValue(
            result
        );
    }

    function inspectRepository(
        repositoryName
    ) {
        metrics.repositoryInspections +=
            1;

        const normalizedName =
            String(
                repositoryName ||
                ""
            ).trim();

        if (!normalizedName) {
            return null;
        }

        const repository =
            TACTIC.repositories?.[
                normalizedName
            ];

        if (
            !repository ||
            typeof repository.inspect !==
                "function"
        ) {
            return null;
        }

        const result =
            safelyRead(
                () =>
                    repository.inspect(),
                null,
                `repository:${normalizedName}`
            );

        recordActivity(
            "inspect-repository",
            normalizedName
        );

        return cloneValue(
            result
        );
    }

    function inspectModule(
        moduleId
    ) {
        metrics.moduleInspections +=
            1;

        const normalizedId =
            String(
                moduleId ||
                ""
            ).trim();

        if (!normalizedId) {
            return null;
        }

        const module =
            TACTIC.modules.get(
                normalizedId
            );

        if (!module) {
            return null;
        }

        recordActivity(
            "inspect-module",
            normalizedId
        );

        return cloneValue({
            id:
                module.id,

            name:
                module.name,

            icon:
                module.icon,

            version:
                module.version,

            order:
                module.order,

            initialized:
                module.initialized,

            initializing:
                module.initializing,

            error:
                module.error,

            enabledByDefault:
                module
                    .enabledByDefault,

            dependencies: [
                ...(
                    module.dependencies ||
                    []
                ),
            ],

            metadata: {
                ...(
                    module.metadata ||
                    {}
                ),
            },

            registeredAt:
                module.registeredAt,
        });
    }

    function collectServices() {
        const output =
            {};

        for (
            const serviceName of
            listInspectableServices()
        ) {
            /*
             * Avoid Diagnostics recursively inspecting itself.
             */
            if (
                serviceName ===
                "diagnostics"
            ) {
                continue;
            }

            output[
                serviceName
            ] =
                inspectService(
                    serviceName
                );
        }

        return output;
    }

    function collectRepositories() {
        const output =
            {};

        for (
            const repositoryName of
            Object.keys(
                TACTIC.repositories ||
                {}
            )
        ) {
            output[
                repositoryName
            ] =
                inspectRepository(
                    repositoryName
                );
        }

        return output;
    }

    function collectModules() {
        return [
            ...TACTIC.modules.keys(),
        ]
            .map(
                inspectModule
            )
            .filter(
                Boolean
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    (
                        first.order ||
                        0
                    ) -
                        (
                            second.order ||
                            0
                        ) ||
                    first.id.localeCompare(
                        second.id
                    )
            );
    }

    function snapshot() {
        metrics.snapshots +=
            1;

        metrics.lastSnapshotAt =
            Date.now();

        const lifecycle =
            safelyRead(
                () =>
                    services.lifecycle
                        ?.inspect(),
                {},
                "lifecycle"
            );

        const healthSnapshot =
            safelyRead(
                () =>
                    services.health
                        ?.snapshot(),
                {},
                "health"
            );

        const errors =
            safelyRead(
                () =>
                    services.errors
                        ?.get(),
                [],
                "errors"
            );

        const logs =
            safelyRead(
                () =>
                    services.logger
                        ?.getEntries?.(),
                [],
                "logger"
            );

        const result = {
            generatedAt:
                Date.now(),

            framework: {
                name:
                    TACTIC.name,

                version:
                    TACTIC.version,

                initialized:
                    TACTIC.initialized,

                build:
                    cloneValue(
                        TACTIC.build ||
                        null
                    ),
            },

            lifecycle:
                cloneValue(
                    lifecycle
                ),

            health:
                cloneValue(
                    healthSnapshot
                ),

            services:
                collectServices(),

            repositories:
                collectRepositories(),

            modules:
                collectModules(),

            state:
                inspectService(
                    "state"
                ),

            jobs:
                inspectService(
                    "jobs"
                ),

            actions:
                inspectService(
                    "actions"
                ),

            workflows:
                inspectService(
                    "workflows"
                ),

            scheduler:
                inspectService(
                    "scheduler"
                ),

            dom:
                inspectService(
                    "dom"
                ),

            navigation:
                inspectService(
                    "navigation"
                ),

            selectors:
                inspectService(
                    "selectors"
                ),

            notifications:
                inspectService(
                    "notifications"
                ),

            settings:
                inspectService(
                    "settings"
                ),

            errors:
                cloneValue(
                    errors
                ),

            logs:
                cloneValue(
                    logs
                ),
        };

        recordActivity(
            "snapshot"
        );

        return result;
    }

    function inspect() {
        return {
            service:
                "diagnostics",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            inspectableServices:
                listInspectableServices(),

            repositoryCount:
                Object.keys(
                    TACTIC.repositories ||
                    {}
                ).length,

            moduleCount:
                TACTIC.modules.size,

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
        };
    }

    TACTIC.services.diagnostics =
        Object.freeze({
            snapshot,

            inspectService,
            inspectRepository,
            inspectModule,

            listInspectableServices,

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
                "diagnostics",

            readOnly:
                true,

            persistent:
                false,

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Diagnostics service loaded"
    );
})();