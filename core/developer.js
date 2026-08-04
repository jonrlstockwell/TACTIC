(() => {
    "use strict";

    const TACTIC = globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Developer] Namespace is unavailable."
        );

        return;
    }

    const storage =
        TACTIC.services.storage;

    const events =
        TACTIC.services.events;

    const logger =
        TACTIC.services.logger;

    const STORAGE_KEY =
        "developer:enabled";

    const metrics = {
        startedAt: Date.now(),

        emittedEvents: 0,
        createdLogs: 0,
        moduleRegistrations: 0,
        moduleInitializations: 0,
        moduleErrors: 0,

        lastEvent: null,
        lastLog: null,
        lastModuleEvent: null,
    };

    function isEnabled() {
        return storage.get(
            STORAGE_KEY,
            true
        );
    }

    function setEnabled(enabled) {
        const normalized =
            Boolean(enabled);

        storage.set(
            STORAGE_KEY,
            normalized
        );

        logger?.info(
            normalized
                ? "Developer Mode enabled"
                : "Developer Mode disabled"
        );

        events?.emit(
            "developer:changed",
            {
                enabled: normalized,
            }
        );

        return normalized;
    }

    function toggle() {
        return setEnabled(
            !isEnabled()
        );
    }

    function incrementMetric(
        key,
        amount = 1
    ) {
        if (
            typeof metrics[key] !==
            "number"
        ) {
            return;
        }

        metrics[key] += amount;
    }

    function getMetrics() {
        const modules = [
            ...TACTIC.modules.values(),
        ];

        return {
            ...metrics,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            moduleCount:
                modules.length,

            initializedModuleCount:
                modules.filter(
                    (module) =>
                        module.initialized
                ).length,

            failedModuleCount:
                modules.filter(
                    (module) =>
                        Boolean(module.error)
                ).length,

            logCount:
                logger
                    ?.getEntries()
                    ?.length || 0,
        };
    }

    function cloneConfig() {
        if (
            typeof structuredClone ===
            "function"
        ) {
            return structuredClone(
                TACTIC.config
            );
        }

        return JSON.parse(
            JSON.stringify(
                TACTIC.config
            )
        );
    }

    function getSnapshot() {
        return {
            app: {
                name: TACTIC.name,
                fullName:
                    TACTIC.fullName,
                version:
                    TACTIC.version,
                initialized:
                    TACTIC.initialized,
            },

            developerModeEnabled:
                isEnabled(),

            modules:
                TACTIC
                    .getAllModuleStatuses
                    ? TACTIC.getAllModuleStatuses()
                    : [],

            metrics:
                getMetrics(),

            config:
                cloneConfig(),
        };
    }

    function printSnapshot() {
        const snapshot =
            getSnapshot();

        console.group(
            `[TACTIC Developer] ${TACTIC.version}`
        );

        console.log(
            "Application",
            snapshot.app
        );

        console.table(
            snapshot.modules.map(
                (module) => ({
                    id: module.id,
                    name: module.name,
                    version:
                        module.version,
                    initialized:
                        module.initialized,
                    error:
                        module.error,
                })
            )
        );

        console.log(
            "Metrics",
            snapshot.metrics
        );

        console.log(
            "Configuration",
            snapshot.config
        );

        console.groupEnd();

        return snapshot;
    }

    events.on(
        "log:created",
        (entry) => {
            incrementMetric(
                "createdLogs"
            );

            metrics.lastLog =
                entry;
        }
    );

    events.on(
        "module:registered",
        (payload) => {
            incrementMetric(
                "moduleRegistrations"
            );

            metrics.lastModuleEvent = {
                type:
                    "registered",
                timestamp:
                    Date.now(),
                moduleId:
                    payload.module.id,
            };
        }
    );

    events.on(
        "module:initialized",
        (payload) => {
            incrementMetric(
                "moduleInitializations"
            );

            metrics.lastModuleEvent = {
                type:
                    "initialized",
                timestamp:
                    Date.now(),
                moduleId:
                    payload.module.id,
            };
        }
    );

    events.on(
        "module:error",
        (payload) => {
            incrementMetric(
                "moduleErrors"
            );

            metrics.lastModuleEvent = {
                type: "error",
                timestamp:
                    Date.now(),
                moduleId:
                    payload.module?.id ||
                    null,
                message:
                    payload.error
                        ?.message ||
                    null,
            };
        }
    );

    /*
     * Wrap emit so Developer Mode can count all emitted events.
     */
    const originalEmit =
        events.emit.bind(events);

    events.emit =
        function trackedEmit(
            eventName,
            payload
        ) {
            incrementMetric(
                "emittedEvents"
            );

            metrics.lastEvent = {
                eventName,
                timestamp:
                    Date.now(),
            };

            return originalEmit(
                eventName,
                payload
            );
        };

    TACTIC.services.developer = {
        isEnabled,
        setEnabled,
        toggle,
        getMetrics,
        getSnapshot,
        printSnapshot,
    };

    document.addEventListener(
        "keydown",
        (event) => {
            if (
                event.ctrlKey &&
                event.shiftKey &&
                event.code === "KeyT"
            ) {
                event.preventDefault();

                if (!isEnabled()) {
                    return;
                }

                printSnapshot();
            }
        }
    );

    GM_registerMenuCommand(
        "Toggle TACTIC Developer Mode",
        () => {
            const enabled =
                toggle();

            alert(
                `TACTIC Developer Mode is now ${
                    enabled
                        ? "enabled"
                        : "disabled"
                }.`
            );
        }
    );

    GM_registerMenuCommand(
        "Print TACTIC Developer Snapshot",
        () => {
            printSnapshot();
        }
    );

    logger?.info(
        "Developer service loaded"
    );
})();