/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/capabilities/index.js
 *
 * Purpose:
 * Provides centralized feature authorization for public,
 * developer-only, and experimental TACTIC capabilities.
 *
 * Responsibilities:
 * - Register capability definitions
 * - Determine whether a capability is allowed
 * - Distinguish public, developer, and experimental features
 * - Support build-profile restrictions
 * - Support authorized-developer restrictions
 * - Explain capability decisions
 * - Expose diagnostics and metrics
 *
 * Does NOT:
 * - Identify the current Torn player
 * - Perform automated actions
 * - Render capability settings
 * - Replace build-time exclusion of developer-only files
 * - Secure code against intentional local modification
 *
 * Public API:
 * - can()
 * - require()
 * - explain()
 * - register()
 * - has()
 * - list()
 * - inspect()
 *
 * Dependencies:
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
            "[TACTIC Capabilities] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        logger,
        errors,
        health,
    } = services;

    const {
        HEALTH_STATES,
    } = constants;

    const SERVICE_NAME =
        "service:capabilities";

    const ACCESS_LEVELS =
        Object.freeze({
            PUBLIC:
                "public",

            DEVELOPER:
                "developer",

            EXPERIMENTAL:
                "experimental",

            DISABLED:
                "disabled",
        });

    const BUILD_PROFILES =
        Object.freeze({
            PUBLIC:
                "public",

            DEVELOPMENT:
                "development",

            TESTING:
                "testing",
        });

    const DEFAULT_CAPABILITIES =
        Object.freeze([
            {
                id:
                    "deposit.prepare",

                name:
                    "Prepare Deposit",

                description:
                    "Allows TACTIC to enter a recommended amount into a verified deposit field without submitting it.",

                access:
                    ACCESS_LEVELS.PUBLIC,

                enabled:
                    true,
            },

            {
                id:
                    "dashboard.liveRefresh",

                name:
                    "Live Dashboard Refresh",

                description:
                    "Allows active TACTIC pages to refresh when their underlying data changes.",

                access:
                    ACCESS_LEVELS.PUBLIC,

                enabled:
                    true,
            },

            {
                id:
                    "protection.monitor",

                name:
                    "Protection Monitoring",

                description:
                    "Allows Protection to monitor the displayed wallet balance.",

                access:
                    ACCESS_LEVELS.PUBLIC,

                enabled:
                    true,
            },

            {
                id:
                    "protection.recommend",

                name:
                    "Protection Recommendations",

                description:
                    "Allows Protection to calculate and display recommended deposit plans.",

                access:
                    ACCESS_LEVELS.PUBLIC,

                enabled:
                    true,
            },

            {
                id:
                    "deposit.submit",

                name:
                    "Submit Deposit",

                description:
                    "Allows TACTIC to submit a deposit form.",

                access:
                    ACCESS_LEVELS.DEVELOPER,

                enabled:
                    false,
            },

            {
                id:
                    "deposit.confirm",

                name:
                    "Confirm Deposit",

                description:
                    "Allows TACTIC to confirm a submitted deposit through a confirmation dialog.",

                access:
                    ACCESS_LEVELS.DEVELOPER,

                enabled:
                    false,
            },

            {
                id:
                    "protection.autoDeposit",

                name:
                    "Automatic Protection Deposit",

                description:
                    "Allows Protection to submit and confirm wallet deposits automatically.",

                access:
                    ACCESS_LEVELS.DEVELOPER,

                enabled:
                    false,
            },

            {
                id:
                    "developer.dashboard",

                name:
                    "Developer Dashboard",

                description:
                    "Allows the Developer Dashboard module to register and appear in the drawer.",

                access:
                    ACCESS_LEVELS.DEVELOPER,

                enabled:
                    false,
            },

            {
                id:
                    "market.autoBuy",

                name:
                    "Automatic Market Purchase",

                description:
                    "Allows TACTIC to automatically purchase market listings.",

                access:
                    ACCESS_LEVELS.EXPERIMENTAL,

                enabled:
                    false,
            },

            {
                id:
                    "travel.autoPurchase",

                name:
                    "Automatic Travel Purchase",

                description:
                    "Allows TACTIC to automatically purchase travel tickets or foreign items.",

                access:
                    ACCESS_LEVELS.EXPERIMENTAL,

                enabled:
                    false,
            },
        ]);

    const capabilities =
        new Map();

    const metrics = {
        startedAt:
            Date.now(),

        registrations:
            0,

        authorizationChecks:
            0,

        allowedChecks:
            0,

        deniedChecks:
            0,

        requirementFailures:
            0,

        lastActivityAt:
            Date.now(),

        lastCapability:
            null,

        lastDecision:
            null,

        lastReason:
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

    function normalizeCapabilityId(
        capabilityId
    ) {
        if (
            typeof capabilityId !==
                "string" ||
            !capabilityId.trim()
        ) {
            throw new TypeError(
                "Capability ID must be a non-empty string."
            );
        }

        const normalized =
            capabilityId.trim();

        if (
            !/^[a-zA-Z0-9._:-]+$/
                .test(normalized)
        ) {
            throw new TypeError(
                "Capability ID contains unsupported characters."
            );
        }

        return normalized;
    }

    function normalizeAccess(
        access
    ) {
        const normalized =
            String(
                access ||
                ACCESS_LEVELS.PUBLIC
            )
                .trim()
                .toLowerCase();

        return Object.values(
            ACCESS_LEVELS
        ).includes(
            normalized
        )
            ? normalized
            : ACCESS_LEVELS.DISABLED;
    }

    function getBuildConfiguration() {
        const capabilityConfig =
            TACTIC.config
                ?.capabilities;

        const buildConfig =
            TACTIC.config
                ?.build;

        const configuredProfile =
            String(
                capabilityConfig
                    ?.profile ||
                buildConfig
                    ?.profile ||
                BUILD_PROFILES.PUBLIC
            )
                .trim()
                .toLowerCase();

        const profile =
            Object.values(
                BUILD_PROFILES
            ).includes(
                configuredProfile
            )
                ? configuredProfile
                : BUILD_PROFILES.PUBLIC;

        const developerAuthorized =
            capabilityConfig
                ?.developerAuthorized ===
            true;

        const experimentalEnabled =
            capabilityConfig
                ?.experimentalEnabled ===
            true;

        const overrides =
            isPlainObject(
                capabilityConfig
                    ?.overrides
            )
                ? {
                      ...capabilityConfig
                          .overrides,
                  }
                : {};

        return {
            profile,
            developerAuthorized,
            experimentalEnabled,
            overrides,
        };
    }

    function createDefinition(
        definition
    ) {
        if (
            !isPlainObject(
                definition
            )
        ) {
            throw new TypeError(
                "Capability definition must be an object."
            );
        }

        const id =
            normalizeCapabilityId(
                definition.id
            );

        return {
            id,

            name:
                typeof definition
                    .name ===
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

            access:
                normalizeAccess(
                    definition.access
                ),

            enabled:
                definition.enabled ===
                true,

            metadata:
                isPlainObject(
                    definition.metadata
                )
                    ? {
                          ...definition
                              .metadata,
                      }
                    : {},

            registeredAt:
                Date.now(),
        };
    }

    function createSnapshot(
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

            access:
                definition.access,

            enabled:
                definition.enabled,

            metadata: {
                ...definition.metadata,
            },

            registeredAt:
                definition.registeredAt,
        };
    }

    function register(
        definition
    ) {
        const normalized =
            createDefinition(
                definition
            );

        capabilities.set(
            normalized.id,
            normalized
        );

        metrics.registrations +=
            1;

        return createSnapshot(
            normalized
        );
    }

    function has(
        capabilityId
    ) {
        try {
            return capabilities.has(
                normalizeCapabilityId(
                    capabilityId
                )
            );
        } catch {
            return false;
        }
    }

    function evaluate(
        capabilityId
    ) {
        const normalizedId =
            normalizeCapabilityId(
                capabilityId
            );

        const definition =
            capabilities.get(
                normalizedId
            );

        const build =
            getBuildConfiguration();

        if (!definition) {
            return {
                capability:
                    normalizedId,

                allowed:
                    false,

                reason:
                    "capability-not-registered",

                definition:
                    null,

                build,
            };
        }

        if (
            Object.prototype
                .hasOwnProperty
                .call(
                    build.overrides,
                    normalizedId
                )
        ) {
            const override =
                build.overrides[
                    normalizedId
                ] === true;

            return {
                capability:
                    normalizedId,

                allowed:
                    override,

                reason:
                    override
                        ? "build-override-allowed"
                        : "build-override-denied",

                definition:
                    createSnapshot(
                        definition
                    ),

                build,
            };
        }

        if (!definition.enabled) {
            return {
                capability:
                    normalizedId,

                allowed:
                    false,

                reason:
                    "capability-disabled",

                definition:
                    createSnapshot(
                        definition
                    ),

                build,
            };
        }

        if (
            definition.access ===
            ACCESS_LEVELS.DISABLED
        ) {
            return {
                capability:
                    normalizedId,

                allowed:
                    false,

                reason:
                    "access-disabled",

                definition:
                    createSnapshot(
                        definition
                    ),

                build,
            };
        }

        if (
            definition.access ===
            ACCESS_LEVELS.PUBLIC
        ) {
            return {
                capability:
                    normalizedId,

                allowed:
                    true,

                reason:
                    "public-capability",

                definition:
                    createSnapshot(
                        definition
                    ),

                build,
            };
        }

        if (
            definition.access ===
            ACCESS_LEVELS.DEVELOPER
        ) {
            const allowed =
                [
                    BUILD_PROFILES
                        .DEVELOPMENT,

                    BUILD_PROFILES
                        .TESTING,
                ].includes(
                    build.profile
                ) &&
                build
                    .developerAuthorized;

            return {
                capability:
                    normalizedId,

                allowed,

                reason:
                    allowed
                        ? "authorized-developer"
                        : "developer-authorization-required",

                definition:
                    createSnapshot(
                        definition
                    ),

                build,
            };
        }

        if (
            definition.access ===
            ACCESS_LEVELS.EXPERIMENTAL
        ) {
            const allowed =
                build.profile ===
                    BUILD_PROFILES
                        .TESTING &&
                build
                    .developerAuthorized &&
                build
                    .experimentalEnabled;

            return {
                capability:
                    normalizedId,

                allowed,

                reason:
                    allowed
                        ? "experimental-enabled"
                        : "experimental-capability-disabled",

                definition:
                    createSnapshot(
                        definition
                    ),

                build,
            };
        }

        return {
            capability:
                normalizedId,

            allowed:
                false,

            reason:
                "unrecognized-access-level",

            definition:
                createSnapshot(
                    definition
                ),

            build,
        };
    }

    function recordDecision(
        decision
    ) {
        metrics.authorizationChecks +=
            1;

        metrics.lastActivityAt =
            Date.now();

        metrics.lastCapability =
            decision.capability;

        metrics.lastDecision =
            decision.allowed;

        metrics.lastReason =
            decision.reason;

        if (decision.allowed) {
            metrics.allowedChecks +=
                1;
        } else {
            metrics.deniedChecks +=
                1;
        }

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastCapability:
                        decision.capability,

                    lastDecision:
                        decision.allowed,

                    lastReason:
                        decision.reason,

                    capabilityCount:
                        capabilities.size,
                },
            }
        );
    }

    function explain(
        capabilityId
    ) {
        const decision =
            evaluate(
                capabilityId
            );

        recordDecision(
            decision
        );

        return {
            ...decision,

            definition:
                decision.definition
                    ? {
                          ...decision
                              .definition,

                          metadata: {
                              ...decision
                                  .definition
                                  .metadata,
                          },
                      }
                    : null,

            build: {
                ...decision.build,

                overrides: {
                    ...decision.build
                        .overrides,
                },
            },
        };
    }

    function can(
        capabilityId
    ) {
        return explain(
            capabilityId
        ).allowed;
    }

    function requireCapability(
        capabilityId,
        options = {}
    ) {
        const decision =
            explain(
                capabilityId
            );

        if (decision.allowed) {
            return true;
        }

        metrics.requirementFailures +=
            1;

        const message =
            options.message ||
            `Capability "${decision.capability}" is not authorized: ${decision.reason}.`;

        const error =
            new Error(
                message
            );

        error.name =
            "CapabilityDeniedError";

        error.capability =
            decision.capability;

        error.reason =
            decision.reason;

        errors?.report({
            code:
                TACTIC.ERROR_CODES
                    ?.GENERAL
                    ?.ACCESS_DENIED ||
                "ACCESS_DENIED",

            severity:
                TACTIC.SEVERITY
                    ?.WARNING ||
                "warning",

            service:
                "capabilities",

            message,

            details: {
                capability:
                    decision.capability,

                reason:
                    decision.reason,

                access:
                    decision.definition
                        ?.access ||
                    null,

                buildProfile:
                    decision.build
                        .profile,
            },

            error,

            recoverable:
                false,

            retryable:
                false,

            recovery:
                "Use a build and identity authorized for this capability.",
        });

        throw error;
    }

    function list(
        filters = {}
    ) {
        let results = [
            ...capabilities.values(),
        ];

        if (filters.access) {
            const access =
                normalizeAccess(
                    filters.access
                );

            results =
                results.filter(
                    (definition) =>
                        definition.access ===
                        access
                );
        }

        if (
            filters.enabled !==
            undefined
        ) {
            results =
                results.filter(
                    (definition) =>
                        definition.enabled ===
                        Boolean(
                            filters.enabled
                        )
                );
        }

        return results
            .map(
                (definition) => ({
                    ...createSnapshot(
                        definition
                    ),

                    decision:
                        evaluate(
                            definition.id
                        ),
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

    function inspect() {
        const build =
            getBuildConfiguration();

        const decisions =
            list();

        return {
            service:
                "capabilities",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            build,

            capabilityCount:
                capabilities.size,

            allowedCount:
                decisions.filter(
                    (entry) =>
                        entry.decision
                            .allowed
                ).length,

            deniedCount:
                decisions.filter(
                    (entry) =>
                        !entry.decision
                            .allowed
                ).length,

            capabilities:
                decisions,

            metrics: {
                ...metrics,
            },

            accessLevels: {
                ...ACCESS_LEVELS,
            },

            buildProfiles: {
                ...BUILD_PROFILES,
            },
        };
    }

    TACTIC.services.capabilities = {
        can,

        require:
            requireCapability,

        explain,
        register,
        has,
        list,
        inspect,

        accessLevels:
            ACCESS_LEVELS,

        buildProfiles:
            BUILD_PROFILES,
    };

    for (
        const definition of
        DEFAULT_CAPABILITIES
    ) {
        register(
            definition
        );
    }

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
                "capabilities",

            capabilityCount:
                capabilities.size,

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Capabilities service loaded",
        {
            capabilityCount:
                capabilities.size,

            profile:
                getBuildConfiguration()
                    .profile,
        }
    );
})();