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
 * validation, aliases, convenience loading, and diagnostics.
 *
 * Responsibilities:
 * - Register named dependency resolvers
 * - Resolve dependencies when requested
 * - Resolve nested TACTIC object paths
 * - Validate required dependencies
 * - Support dependency aliases
 * - Resolve multiple dependencies
 * - Support required and optional dependencies
 * - Expose the TACTIC.resolve() convenience API
 * - Expose the TACTIC.require() convenience API
 * - Expose the TACTIC.use() convenience API
 * - Report missing and failed resolutions
 * - Expose dependency diagnostics
 *
 * Does NOT:
 * - Create services
 * - Initialize modules
 * - Change service load order
 * - Persist dependency instances
 * - Automatically migrate existing modules
 *
 * Public API:
 * - TACTIC.dependencies.register()
 * - TACTIC.dependencies.registerPath()
 * - TACTIC.dependencies.alias()
 * - TACTIC.dependencies.has()
 * - TACTIC.dependencies.resolve()
 * - TACTIC.dependencies.require()
 * - TACTIC.dependencies.resolveMany()
 * - TACTIC.dependencies.use()
 * - TACTIC.dependencies.list()
 * - TACTIC.dependencies.listAliases()
 * - TACTIC.dependencies.inspect()
 * - TACTIC.resolve()
 * - TACTIC.require()
 * - TACTIC.requireDependencies()
 * - TACTIC.use()
 *
 * Dependencies:
 * - core/namespace.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    console.log(
    "[TACTIC Dependencies] File execution started"
    );

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

        aliasReplacements:
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

        batchResolutions:
            0,

        successfulBatchResolutions:
            0,

        failedBatchResolutions:
            0,

        useRequests:
            0,

        successfulUseRequests:
            0,

        failedUseRequests:
            0,

        lastDependency:
            null,

        lastResolvedAt:
            null,

        lastBatchAt:
            null,

        lastUseAt:
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
                .test(
                    normalized
                )
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

        const parts =
            value
                .trim()
                .split(".")
                .map(
                    (part) =>
                        part.trim()
                )
                .filter(
                    Boolean
                );

        if (
            parts.length ===
            0
        ) {
            throw new TypeError(
                "Dependency path must contain at least one valid segment."
            );
        }

        return parts;
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
                String(
                    error
                ),

            timestamp:
                Date.now(),
        };
    }

    function cloneErrorSnapshot(
        errorSnapshot
    ) {
        return errorSnapshot
            ? {
                  ...errorSnapshot,
              }
            : null;
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
                cloneErrorSnapshot(
                    record.lastError
                ),
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
                    "string" &&
                options.path.trim()
                    ? options.path
                          .trim()
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

        const existing =
            aliases.get(
                normalizedAlias
            );

        if (
            existing &&
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

        /*
         * Validate that the new alias does not create a circular
         * alias chain.
         */
        try {
            resolveAlias(
                normalizedAlias
            );
        } catch (error) {
            if (existing) {
                aliases.set(
                    normalizedAlias,
                    existing
                );
            } else {
                aliases.delete(
                    normalizedAlias
                );
            }

            throw error;
        }

        if (existing) {
            metrics.aliasReplacements +=
                1;
        } else {
            metrics.aliasRegistrations +=
                1;
        }

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

                const error =
                    new Error(
                        `Dependency "${requestedName}" is not registered.`
                    );

                error.name =
                    "TACTICDependencyNotRegisteredError";

                metrics.lastError =
                    createErrorSnapshot(
                        error
                    );

                throw error;
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

                metrics.lastError =
                    null;

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

                const error =
                    new Error(
                        `Dependency "${requestedName}" is registered but currently unavailable.`
                    );

                error.name =
                    "TACTICDependencyUnavailableError";

                record.lastError =
                    createErrorSnapshot(
                        error
                    );

                metrics.lastError =
                    createErrorSnapshot(
                        error
                    );

                throw error;
            }

            return (
                options.fallback ??
                null
            );
        } catch (error) {
            /*
             * Required-unavailable errors are created by this
             * function after the resolver returns no value. They
             * should not be counted as resolver execution errors.
             */
            const generatedUnavailableError =
                error?.name ===
                "TACTICDependencyUnavailableError";

            if (
                !generatedUnavailableError
            ) {
                record.resolverErrors +=
                    1;

                metrics.resolverErrors +=
                    1;
            }

            record.lastAvailable =
                false;

            record.lastError =
                createErrorSnapshot(
                    error
                );

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
                    requestedName,
                    {
                        required:
                            false,

                        fallback:
                            null,
                    }
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

        metrics.batchResolutions +=
            1;

        metrics.lastBatchAt =
            Date.now();

        const resolved = {};

        const missing = [];

        for (
            const name of
            names
        ) {
            const requestedName =
                normalizeName(
                    name
                );

            const value =
                resolve(
                    requestedName,
                    {
                        required:
                            false,

                        fallback:
                            null,
                    }
                );

            resolved[
                requestedName
            ] = value;

            if (
                value ===
                null
            ) {
                missing.push(
                    requestedName
                );
            }
        }

        const success =
            missing.length ===
            0;

        if (success) {
            metrics
                .successfulBatchResolutions +=
                1;
        } else {
            metrics
                .failedBatchResolutions +=
                1;
        }

        if (
            options.required ===
                true &&
            !success
        ) {
            metrics.requiredFailures +=
                1;

            const error =
                new Error(
                    `Required dependencies are unavailable: ${missing.join(", ")}`
                );

            error.name =
                "TACTICRequiredDependenciesUnavailableError";

            error.missing =
                [
                    ...missing,
                ];

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            throw error;
        }

        return {
            success,

            resolved,

            missing,
        };
    }

    function normalizeUseOption(
        option
    ) {
        if (
            option ===
            false
        ) {
            return {
                required:
                    false,

                fallback:
                    null,
            };
        }

        if (
            option ===
                true ||
            option ===
                undefined ||
            option ===
                null
        ) {
            return {
                required:
                    true,

                fallback:
                    null,
            };
        }

        if (
            isPlainObject(
                option
            )
        ) {
            return {
                required:
                    option.required !==
                    false,

                fallback:
                    option.fallback ??
                    null,
            };
        }

        throw new TypeError(
            "TACTIC.use() dependency options must be true, false, null, undefined, or an options object."
        );
    }

    function use(
        dependencies
    ) {
        metrics.useRequests +=
            1;

        metrics.lastUseAt =
            Date.now();

        try {
            /*
             * Array syntax:
             *
             * TACTIC.use([
             *     "navigation",
             *     "deposit",
             *     "user"
             * ]);
             *
             * Every dependency in array syntax is required.
             */
            if (
                Array.isArray(
                    dependencies
                )
            ) {
                const result =
                    resolveMany(
                        dependencies,
                        {
                            required:
                                true,
                        }
                    );

                metrics
                    .successfulUseRequests +=
                    1;

                return result.resolved;
            }

            /*
             * Object syntax:
             *
             * TACTIC.use({
             *     navigation: true,
             *     deposit: {
             *         required: true
             *     },
             *     optionalPlugin: false
             * });
             */
            if (
                isPlainObject(
                    dependencies
                )
            ) {
                const resolved = {};

                const missing = [];

                for (
                    const [
                        name,
                        rawOption,
                    ] of Object.entries(
                        dependencies
                    )
                ) {
                    const requestedName =
                        normalizeName(
                            name
                        );

                    const option =
                        normalizeUseOption(
                            rawOption
                        );

                    const value =
                        resolve(
                            requestedName,
                            {
                                required:
                                    option.required,

                                fallback:
                                    option.fallback,
                            }
                        );

                    /*
                     * Preserve the caller's object key so modules
                     * may choose readable local dependency names.
                     */
                    resolved[
                        name
                    ] = value;

                    if (
                        value ===
                            null ||
                        value ===
                            undefined
                    ) {
                        missing.push(
                            requestedName
                        );
                    }
                }

                metrics
                    .successfulUseRequests +=
                    1;

                return resolved;
            }

            throw new TypeError(
                "TACTIC.use() expects an array or plain object."
            );
        } catch (error) {
            metrics.failedUseRequests +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            throw error;
        }
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
        const dependencySnapshots =
            list();

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

            availableCount:
                dependencySnapshots
                    .filter(
                        (
                            dependency
                        ) =>
                            dependency
                                .lastAvailable ===
                            true
                    )
                    .length,

            unavailableCount:
                dependencySnapshots
                    .filter(
                        (
                            dependency
                        ) =>
                            dependency
                                .lastAvailable ===
                            false
                    )
                    .length,

            unresolvedCount:
                dependencySnapshots
                    .filter(
                        (
                            dependency
                        ) =>
                            dependency
                                .lastAvailable ===
                            null
                    )
                    .length,

            dependencies:
                dependencySnapshots,

            aliases:
                listAliases(),

            metrics: {
                ...metrics,

                lastError:
                    cloneErrorSnapshot(
                        metrics.lastError
                    ),
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
            use,

            list,
            listAliases,
            inspect,
        });

    TACTIC.dependencies =
        dependencies;

    TACTIC.resolve =
        resolve;

    TACTIC.require =
        requireDependency;

    TACTIC.requireDependencies =
        resolveMany;

    TACTIC.use =
        use;

    /*
     * Initial dependency paths.
     *
     * These use dynamic path resolvers. The individual services
     * do not have to exist when this file loads. They only need
     * to exist when the dependency is resolved.
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

            convenienceApis: [
                "TACTIC.resolve",
                "TACTIC.require",
                "TACTIC.requireDependencies",
                "TACTIC.use",
            ],
        }
    );
})();