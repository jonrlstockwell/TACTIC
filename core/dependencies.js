/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * core/dependencies.js
 *
 * Purpose:
 * Provides centralized dependency registration, resolution,
 * validation, and diagnostics.
 *
 * Responsibilities:
 * - Register named dependency resolvers
 * - Resolve dependencies when requested
 * - Resolve nested TACTIC object paths
 * - Validate required dependencies
 * - Support aliases
 * - Report missing and failed resolutions
 * - Expose dependency diagnostics
 *
 * Does NOT:
 * - Create services
 * - Initialize modules
 * - Change service load order
 * - Automatically replace direct property access
 * - Persist dependency instances
 *
 * Public API:
 * - TACTIC.dependencies.register()
 * - TACTIC.dependencies.registerPath()
 * - TACTIC.dependencies.alias()
 * - TACTIC.dependencies.has()
 * - TACTIC.dependencies.resolve()
 * - TACTIC.dependencies.require()
 * - TACTIC.dependencies.resolveMany()
 * - TACTIC.dependencies.inspect()
 * - TACTIC.resolve()
 * - TACTIC.requireDependencies()
 *
 * Dependencies:
 * - core/namespace.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Dependencies] Namespace is unavailable."
        );

        return;
    }

    const registry =
        new Map();

    const aliases =
        new Map();

    const metrics = {
        loadedAt:
            Date.now(),

        registrations:
            0,

        replacements:
            0,

        aliasRegistrations:
            0,

        resolutions:
            0,

        successfulResolutions:
            0,

        missingResolutions:
            0,

        resolverErrors:
            0,

        requiredFailures:
            0,

        lastDependency:
            null,

        lastResolvedAt:
            null,

        lastError:
            null,
    };

    function normalizeName(
        value
    ) {
        if (
            typeof value !==
                "string" ||
            !value.trim()
        ) {
            throw new TypeError(
                "Dependency name must be a non-empty string."
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
                `Dependency name "${value}" contains unsupported characters.`
            );
        }

        return normalized;
    }

    function normalizePath(
        value
    ) {
        if (
            typeof value !==
                "string" ||
            !value.trim()
        ) {
            throw new TypeError(
                "Dependency path must be a non-empty string."
            );
        }

        return value
            .trim()
            .split(".")
            .map(
                (part) =>
                    part.trim()
            )
            .filter(
                Boolean
            );
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

    function followPath(
        path
    ) {
        const parts =
            Array.isArray(
                path
            )
                ? path
                : normalizePath(
                      path
                  );

        let value =
            TACTIC;

        for (
            const part of
            parts
        ) {
            if (
                value ===
                    null ||
                value ===
                    undefined
            ) {
                return undefined;
            }

            value =
                value[
                    part
                ];
        }

        return value;
    }

    function resolveAlias(
        dependencyName
    ) {
        let current =
            dependencyName;

        const visited =
            new Set();

        while (
            aliases.has(
                current
            )
        ) {
            if (
                visited.has(
                    current
                )
            ) {
                throw new Error(
                    `Circular dependency alias detected for "${dependencyName}".`
                );
            }

            visited.add(
                current
            );

            current =
                aliases.get(
                    current
                );
        }

        return current;
    }

    function createSnapshot(
        record
    ) {
        if (!record) {
            return null;
        }

        return {
            name:
                record.name,

            description:
                record.description,

            path:
                record.path,

            required:
                record.required,

            registeredAt:
                record.registeredAt,

            resolutions:
                record.resolutions,

            successfulResolutions:
                record
                    .successfulResolutions,

            missingResolutions:
                record
                    .missingResolutions,

            resolverErrors:
                record.resolverErrors,

            lastResolvedAt:
                record.lastResolvedAt,

            lastAvailable:
                record.lastAvailable,

            lastError:
                record.lastError
                    ? {
                          ...record
                              .lastError,
                      }
                    : null,
        };
    }

    function register(
        name,
        resolver,
        options = {}
    ) {
        const normalizedName =
            normalizeName(
                name
            );

        if (
            typeof resolver !==
            "function"
        ) {
            throw new TypeError(
                `Dependency resolver for "${normalizedName}" must be a function.`
            );
        }

        const existing =
            registry.get(
                normalizedName
            );

        if (
            existing &&
            options.replace !==
                true
        ) {
            throw new Error(
                `Dependency "${normalizedName}" is already registered.`
            );
        }

        const record = {
            name:
                normalizedName,

            description:
                typeof options
                    .description ===
                    "string"
                    ? options
                          .description
                          .trim()
                    : "",

            path:
                typeof options.path ===
                    "string"
                    ? options.path
                    : null,

            required:
                options.required ===
                true,

            resolver,

            registeredAt:
                existing
                    ?.registeredAt ||
                Date.now(),

            resolutions:
                existing
                    ?.resolutions ||
                0,

            successfulResolutions:
                existing
                    ?.successfulResolutions ||
                0,

            missingResolutions:
                existing
                    ?.missingResolutions ||
                0,

            resolverErrors:
                existing
                    ?.resolverErrors ||
                0,

            lastResolvedAt:
                existing
                    ?.lastResolvedAt ||
                null,

            lastAvailable:
                existing
                    ?.lastAvailable ??
                null,

            lastError:
                existing
                    ?.lastError ||
                null,
        };

        registry.set(
            normalizedName,
            record
        );

        if (existing) {
            metrics.replacements +=
                1;
        } else {
            metrics.registrations +=
                1;
        }

        return createSnapshot(
            record
        );
    }

    function registerPath(
        name,
        path,
        options = {}
    ) {
        const normalizedPath =
            normalizePath(
                path
            );

        return register(
            name,
            () =>
                followPath(
                    normalizedPath
                ),
            {
                ...options,

                path:
                    normalizedPath
                        .join("."),
            }
        );
    }

    function alias(
        aliasName,
        targetName,
        options = {}
    ) {
        const normalizedAlias =
            normalizeName(
                aliasName
            );

        const normalizedTarget =
            normalizeName(
                targetName
            );

        if (
            normalizedAlias ===
            normalizedTarget
        ) {
            throw new Error(
                "A dependency alias cannot target itself."
            );
        }

        if (
            aliases.has(
                normalizedAlias
            ) &&
            options.replace !==
                true
        ) {
            throw new Error(
                `Dependency alias "${normalizedAlias}" is already registered.`
            );
        }

        aliases.set(
            normalizedAlias,
            normalizedTarget
        );

        metrics.aliasRegistrations +=
            1;

        return {
            alias:
                normalizedAlias,

            target:
                normalizedTarget,
        };
    }

    function resolve(
        name,
        options = {}
    ) {
        const requestedName =
            normalizeName(
                name
            );

        const normalizedName =
            resolveAlias(
                requestedName
            );

        metrics.resolutions +=
            1;

        metrics.lastDependency =
            requestedName;

        metrics.lastResolvedAt =
            Date.now();

        const record =
            registry.get(
                normalizedName
            );

        if (!record) {
            metrics.missingResolutions +=
                1;

            if (
                options.required ===
                true
            ) {
                metrics.requiredFailures +=
                    1;

                throw new Error(
                    `Dependency "${requestedName}" is not registered.`
                );
            }

            return (
                options.fallback ??
                null
            );
        }

        record.resolutions +=
            1;

        record.lastResolvedAt =
            Date.now();

        try {
            const value =
                record.resolver({
                    name:
                        normalizedName,

                    requestedName,

                    TACTIC,
                });

            const available =
                value !==
                    null &&
                value !==
                    undefined;

            record.lastAvailable =
                available;

            record.lastError =
                null;

            if (available) {
                record
                    .successfulResolutions +=
                    1;

                metrics
                    .successfulResolutions +=
                    1;

                return value;
            }

            record
                .missingResolutions +=
                1;

            metrics.missingResolutions +=
                1;

            if (
                options.required ===
                    true ||
                record.required
            ) {
                metrics.requiredFailures +=
                    1;

                throw new Error(
                    `Dependency "${requestedName}" is registered but currently unavailable.`
                );
            }

            return (
                options.fallback ??
                null
            );
        } catch (error) {
            record.resolverErrors +=
                1;

            record.lastAvailable =
                false;

            record.lastError =
                createErrorSnapshot(
                    error
                );

            metrics.resolverErrors +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            if (
                options.required ===
                    true ||
                record.required
            ) {
                throw error;
            }

            return (
                options.fallback ??
                null
            );
        }
    }

    function requireDependency(
        name
    ) {
        return resolve(
            name,
            {
                required:
                    true,
            }
        );
    }

    function has(
        name,
        options = {}
    ) {
        try {
            const requestedName =
                normalizeName(
                    name
                );

            const normalizedName =
                resolveAlias(
                    requestedName
                );

            if (
                !registry.has(
                    normalizedName
                )
            ) {
                return false;
            }

            if (
                options.available !==
                true
            ) {
                return true;
            }

            return (
                resolve(
                    requestedName
                ) !==
                null
            );
        } catch {
            return false;
        }
    }

    function resolveMany(
        names,
        options = {}
    ) {
        if (
            !Array.isArray(
                names
            )
        ) {
            throw new TypeError(
                "Dependency names must be provided as an array."
            );
        }

        const resolved = {};

        const missing = [];

        for (
            const name of
            names
        ) {
            const normalizedName =
                normalizeName(
                    name
                );

            const value =
                resolve(
                    normalizedName,
                    {
                        required:
                            false,

                        fallback:
                            null,
                    }
                );

            resolved[
                normalizedName
            ] = value;

            if (
                value ===
                null
            ) {
                missing.push(
                    normalizedName
                );
            }
        }

        if (
            options.required ===
                true &&
            missing.length > 0
        ) {
            metrics.requiredFailures +=
                1;

            throw new Error(
                `Required dependencies are unavailable: ${missing.join(", ")}`
            );
        }

        return {
            success:
                missing.length ===
                0,

            resolved,

            missing,
        };
    }

    function list() {
        return [
            ...registry.values(),
        ]
            .map(
                createSnapshot
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

    function listAliases() {
        return Object.fromEntries(
            [
                ...aliases.entries(),
            ].sort(
                (
                    first,
                    second
                ) =>
                    first[0].localeCompare(
                        second[0]
                    )
            )
        );
    }

    function inspect() {
        return {
            service:
                "dependencies",

            loadedAt:
                metrics.loadedAt,

            uptimeMs:
                Date.now() -
                metrics.loadedAt,

            registrationCount:
                registry.size,

            aliasCount:
                aliases.size,

            dependencies:
                list(),

            aliases:
                listAliases(),

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

    const dependencies =
        Object.freeze({
            register,
            registerPath,
            alias,

            has,
            resolve,
            require:
                requireDependency,

            resolveMany,

            list,
            listAliases,
            inspect,
        });

    TACTIC.dependencies =
        dependencies;

    TACTIC.resolve =
        resolve;

    TACTIC.requireDependencies =
        resolveMany;

    /*
     * Initial dependency paths.
     *
     * These resolve dynamically, so the registry can load before
     * the individual services are created.
     */
    const initialPaths = {
        logger:
            "services.logger",

        events:
            "services.events",

        errors:
            "services.errors",

        scheduler:
            "services.scheduler",

        health:
            "services.health",

        lifecycle:
            "services.lifecycle",

        modules:
            "services.modules",

        storage:
            "services.storage",

        capabilities:
            "services.capabilities",

        settings:
            "services.settings",

        notifications:
            "services.notifications",

        actions:
            "services.actions",

        workflows:
            "services.workflows",

        state:
            "services.state",

        jobs:
            "services.jobs",

        transactions:
            "services.transactions",

        dom:
            "services.dom",

        selectors:
            "services.selectors",

        navigation:
            "services.navigation",

        diagnostics:
            "services.diagnostics",

        deposit:
            "services.deposit",

        depositDestinations:
            "services.depositDestinations",

        drawer:
            "services.drawer",

        userRepository:
            "repositories.user",

        protection:
            "protection",
    };

    for (
        const [
            name,
            path,
        ] of Object.entries(
            initialPaths
        )
    ) {
        registerPath(
            name,
            path,
            {
                description:
                    `Resolves TACTIC.${path}.`,
            }
        );
    }

    alias(
        "user",
        "userrepository"
    );

    alias(
        "deposit-destinations",
        "depositdestinations"
    );

    console.log(
        "[TACTIC Dependencies] Dependency Registry loaded",
        {
            dependencies:
                registry.size,

            aliases:
                aliases.size,
        }
    );
})();