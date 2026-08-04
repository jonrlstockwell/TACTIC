(() => {
    "use strict";

    const TACTIC = globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Module Manager] Namespace is unavailable."
        );

        return;
    }

    const logger =
        TACTIC.services.logger;

    const events =
        TACTIC.services.events;

    const VALID_ID_PATTERN =
        /^[a-z][a-z0-9-]*$/;

    function validateModuleDefinition(
        definition
    ) {
        if (
            !definition ||
            typeof definition !== "object"
        ) {
            throw new TypeError(
                "Module definition must be an object."
            );
        }

        const {
            id,
            name,
            icon,
            version,
            order,
            dependencies,
            init,
            render,
            destroy,
        } = definition;

        if (
            typeof id !== "string" ||
            !VALID_ID_PATTERN.test(id)
        ) {
            throw new Error(
                `Invalid module id: ${String(
                    id
                )}`
            );
        }

        if (
            typeof name !== "string" ||
            !name.trim()
        ) {
            throw new Error(
                `Module "${id}" requires a name.`
            );
        }

        if (
            icon !== undefined &&
            typeof icon !== "string"
        ) {
            throw new Error(
                `Module "${id}" icon must be a string.`
            );
        }

        if (
            version !== undefined &&
            typeof version !== "string"
        ) {
            throw new Error(
                `Module "${id}" version must be a string.`
            );
        }

        if (
            order !== undefined &&
            !Number.isFinite(order)
        ) {
            throw new Error(
                `Module "${id}" order must be numeric.`
            );
        }

        if (
            dependencies !== undefined &&
            !Array.isArray(dependencies)
        ) {
            throw new Error(
                `Module "${id}" dependencies must be an array.`
            );
        }

        for (
            const dependency of
            dependencies || []
        ) {
            if (
                typeof dependency !==
                "string"
            ) {
                throw new Error(
                    `Module "${id}" contains an invalid dependency.`
                );
            }
        }

        for (const [
            functionName,
            functionValue,
        ] of [
            ["init", init],
            ["render", render],
            ["destroy", destroy],
        ]) {
            if (
                functionValue !== undefined &&
                typeof functionValue !==
                    "function"
            ) {
                throw new Error(
                    `Module "${id}" ${functionName} must be a function.`
                );
            }
        }
    }

    function normalizeModuleDefinition(
        definition
    ) {
        return {
            id: definition.id,
            name: definition.name.trim(),

            icon:
                definition.icon || "🧩",

            version:
                definition.version ||
                "1.0.0",

            order:
                Number.isFinite(
                    definition.order
                )
                    ? definition.order
                    : 100,

            dependencies: [
                ...new Set(
                    definition.dependencies ||
                        []
                ),
            ],

            enabledByDefault:
                definition.enabledByDefault !==
                false,

            init:
                definition.init ||
                (() => {}),

            render:
                definition.render ||
                (() => {}),

            destroy:
                definition.destroy ||
                (() => {}),

            /*
             * Module runtime fields.
             */
            initialized: false,
            initializing: false,
            error: null,
            registeredAt:
                Date.now(),

            metadata: {
                ...(definition.metadata ||
                    {}),
            },
        };
    }

    function registerModule(
        definition
    ) {
        validateModuleDefinition(
            definition
        );

        const id =
            definition.id;

        if (
            TACTIC.modules.has(id)
        ) {
            throw new Error(
                `Module "${id}" is already registered.`
            );
        }

        const module =
            normalizeModuleDefinition(
                definition
            );

        TACTIC.modules.set(
            id,
            module
        );

        logger?.info(
            `Module registered: ${id}`,
            {
                name: module.name,
                version:
                    module.version,
                dependencies:
                    module.dependencies,
            }
        );

        events?.emit(
            "module:registered",
            {
                module,
            }
        );

        return module;
    }

    function unregisterModule(id) {
        const module =
            TACTIC.modules.get(id);

        if (!module) {
            return false;
        }

        if (module.initialized) {
            try {
                module.destroy({
                    TACTIC,
                    module,
                });
            } catch (error) {
                logger?.error(
                    `Module destroy failed: ${id}`,
                    {
                        message:
                            error.message,
                    }
                );
            }
        }

        TACTIC.modules.delete(id);

        events?.emit(
            "module:unregistered",
            {
                id,
            }
        );

        logger?.info(
            `Module unregistered: ${id}`
        );

        return true;
    }

    function getModule(id) {
        return (
            TACTIC.modules.get(id) ||
            null
        );
    }

    function hasModule(id) {
        return TACTIC.modules.has(
            id
        );
    }

    function getModules() {
        return [
            ...TACTIC.modules.values(),
        ].sort(
            (first, second) =>
                first.order -
                    second.order ||
                first.name.localeCompare(
                    second.name
                )
        );
    }

    function getMissingDependencies(
        module
    ) {
        return module.dependencies.filter(
            (dependencyId) =>
                !TACTIC.modules.has(
                    dependencyId
                )
        );
    }

    function getUninitializedDependencies(
        module
    ) {
        return module.dependencies.filter(
            (dependencyId) => {
                const dependency =
                    TACTIC.modules.get(
                        dependencyId
                    );

                return (
                    dependency &&
                    !dependency.initialized
                );
            }
        );
    }

    async function initializeModule(
        id,
        initializationStack = []
    ) {
        const module =
            getModule(id);

        if (!module) {
            throw new Error(
                `Module "${id}" is not registered.`
            );
        }

        if (module.initialized) {
            return module;
        }

        if (module.initializing) {
            throw new Error(
                `Circular module initialization detected: ${[
                    ...initializationStack,
                    id,
                ].join(" → ")}`
            );
        }

        const missingDependencies =
            getMissingDependencies(
                module
            );

        if (
            missingDependencies.length >
            0
        ) {
            const message =
                `Module "${id}" is missing dependencies: ` +
                missingDependencies.join(
                    ", "
                );

            module.error =
                message;

            logger?.error(message);

            events?.emit(
                "module:error",
                {
                    module,
                    error:
                        new Error(
                            message
                        ),
                }
            );

            throw new Error(message);
        }

        module.initializing = true;
        module.error = null;

        try {
            for (
                const dependencyId of
                module.dependencies
            ) {
                await initializeModule(
                    dependencyId,
                    [
                        ...initializationStack,
                        id,
                    ]
                );
            }

            await module.init({
                TACTIC,
                module,
                services:
                    TACTIC.services,
                events,
                logger,
            });

            module.initialized = true;
            module.initializing =
                false;

            logger?.info(
                `Module initialized: ${id}`
            );

            events?.emit(
                "module:initialized",
                {
                    module,
                }
            );

            return module;
        } catch (error) {
            module.initialized =
                false;

            module.initializing =
                false;

            module.error =
                error.message;

            logger?.error(
                `Module initialization failed: ${id}`,
                {
                    message:
                        error.message,
                    stack:
                        error.stack,
                }
            );

            events?.emit(
                "module:error",
                {
                    module,
                    error,
                }
            );

            throw error;
        }
    }

    async function initializeAllModules() {
        const modules =
            getModules();

        const results = [];

        for (const module of modules) {
            try {
                await initializeModule(
                    module.id
                );

                results.push({
                    id: module.id,
                    success: true,
                });
            } catch (error) {
                results.push({
                    id: module.id,
                    success: false,
                    error:
                        error.message,
                });
            }
        }

        events?.emit(
            "modules:initialized",
            {
                results,
            }
        );

        return results;
    }

    function getModuleStatus(id) {
        const module =
            getModule(id);

        if (!module) {
            return null;
        }

        return {
            id: module.id,
            name: module.name,
            version:
                module.version,

            initialized:
                module.initialized,

            initializing:
                module.initializing,

            error:
                module.error,

            dependencies: [
                ...module.dependencies,
            ],

            missingDependencies:
                getMissingDependencies(
                    module
                ),

            uninitializedDependencies:
                getUninitializedDependencies(
                    module
                ),
        };
    }

    function getAllModuleStatuses() {
        return getModules().map(
            (module) =>
                getModuleStatus(
                    module.id
                )
        );
    }

    TACTIC.registerModule =
        registerModule;

    TACTIC.unregisterModule =
        unregisterModule;

    TACTIC.getModule =
        getModule;

    TACTIC.hasModule =
        hasModule;

    TACTIC.getModules =
        getModules;

    TACTIC.initializeModule =
        initializeModule;

    TACTIC.initializeAllModules =
        initializeAllModules;

    TACTIC.getModuleStatus =
        getModuleStatus;

    TACTIC.getAllModuleStatuses =
        getAllModuleStatuses;

    TACTIC.services.moduleManager = {
        registerModule,
        unregisterModule,
        getModule,
        hasModule,
        getModules,
        initializeModule,
        initializeAllModules,
        getModuleStatus,
        getAllModuleStatuses,
    };

    logger?.info(
        "Module Manager loaded"
    );
})();