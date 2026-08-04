/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * core/logger.js
 *
 * Purpose:
 * Provides centralized, level-based logging for the TACTIC
 * framework, services, repositories, UI, and modules.
 *
 * Responsibilities:
 * - Create structured log records
 * - Filter logs according to the active level
 * - Write eligible logs to the browser console
 * - Store bounded log history
 * - Emit log events
 * - Persist the selected logging level
 * - Expose logging diagnostics
 *
 * Does NOT:
 * - Display user-facing notifications
 * - Report structured application errors
 * - Contain feature business logic
 *
 * Public API:
 * - trace()
 * - debug()
 * - info()
 * - warn()
 * - error()
 * - write()
 * - setLevel()
 * - getLevel()
 * - isEnabled()
 * - getEntries()
 * - clear()
 * - inspect()
 *
 * Dependencies:
 * - core/config.js
 * - core/storage.js
 * - core/events.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Logger] Namespace is unavailable."
        );

        return;
    }

    const LOG_STORAGE_KEY =
        "core:logs";

    const LEVEL_STORAGE_KEY =
        "core:logger-level";

    const LEVELS =
        Object.freeze({
            TRACE:
                "trace",

            DEBUG:
                "debug",

            INFO:
                "info",

            WARN:
                "warn",

            ERROR:
                "error",

            SILENT:
                "silent",
        });

    const LEVEL_PRIORITIES =
        Object.freeze({
            [LEVELS.TRACE]:
                10,

            [LEVELS.DEBUG]:
                20,

            [LEVELS.INFO]:
                30,

            [LEVELS.WARN]:
                40,

            [LEVELS.ERROR]:
                50,

            [LEVELS.SILENT]:
                Number.POSITIVE_INFINITY,
        });

    const DEFAULT_LEVEL =
        LEVELS.INFO;

    const metrics = {
        startedAt:
            Date.now(),

        attempted:
            0,

        written:
            0,

        filtered:
            0,

        consoleWrites:
            0,

        storageWrites:
            0,

        clearCount:
            0,

        levelChanges:
            0,

        lastEntryAt:
            null,

        lastLevel:
            null,

        byLevel: {
            trace:
                0,

            debug:
                0,

            info:
                0,

            warn:
                0,

            error:
                0,
        },
    };

    function getStorage() {
        return TACTIC.services
            .storage;
    }

    function getEvents() {
        return TACTIC.services
            .events;
    }

    function normalizeLevel(
        level
    ) {
        const normalized =
            String(
                level || ""
            )
                .trim()
                .toLowerCase();

        if (
            Object.values(
                LEVELS
            ).includes(
                normalized
            )
        ) {
            return normalized;
        }

        return null;
    }

    function getConfiguredDefaultLevel() {
        const configured =
            normalizeLevel(
                TACTIC.config
                    ?.logging
                    ?.level
            );

        return (
            configured ||
            DEFAULT_LEVEL
        );
    }

    function loadStoredLevel() {
        const storage =
            getStorage();

        if (!storage) {
            return getConfiguredDefaultLevel();
        }

        const storedLevel =
            normalizeLevel(
                storage.get(
                    LEVEL_STORAGE_KEY,
                    null
                )
            );

        return (
            storedLevel ||
            getConfiguredDefaultLevel()
        );
    }

    let activeLevel =
        loadStoredLevel();

    function createEntry(
        level,
        message,
        data = null
    ) {
        const timestamp =
            Date.now();

        return {
            timestamp,

            isoTime:
                new Date(
                    timestamp
                ).toISOString(),

            level,

            message:
                String(message),

            data,
        };
    }

    function loggingEnabled() {
        return (
            TACTIC.config
                ?.logging
                ?.enabled !==
            false
        );
    }

    function consoleEnabled() {
        return (
            TACTIC.config
                ?.logging
                ?.consoleEnabled !==
            false
        );
    }

    function maximumStoredEntries() {
        const configured =
            Number(
                TACTIC.config
                    ?.logging
                    ?.maximumStoredEntries
            );

        if (
            Number.isSafeInteger(
                configured
            ) &&
            configured > 0
        ) {
            return configured;
        }

        return (
            TACTIC.DEFAULTS
                ?.MAX_LOG_HISTORY ||
            500
        );
    }

    function isEnabled(
        level
    ) {
        const normalizedLevel =
            normalizeLevel(
                level
            );

        if (
            !normalizedLevel ||
            normalizedLevel ===
                LEVELS.SILENT
        ) {
            return false;
        }

        if (
            !loggingEnabled() ||
            activeLevel ===
                LEVELS.SILENT
        ) {
            return false;
        }

        return (
            LEVEL_PRIORITIES[
                normalizedLevel
            ] >=
            LEVEL_PRIORITIES[
                activeLevel
            ]
        );
    }

    function saveEntry(
        entry
    ) {
        const storage =
            getStorage();

        if (
            !storage ||
            !loggingEnabled()
        ) {
            return false;
        }

        const logs =
            storage.get(
                LOG_STORAGE_KEY,
                []
            );

        const safeLogs =
            Array.isArray(
                logs
            )
                ? logs
                : [];

        safeLogs.push(
            entry
        );

        storage.set(
            LOG_STORAGE_KEY,
            safeLogs.slice(
                -maximumStoredEntries()
            )
        );

        metrics.storageWrites +=
            1;

        return true;
    }

    function writeToConsole(
        entry
    ) {
        if (
            !consoleEnabled()
        ) {
            return false;
        }

        let method =
            "log";

        if (
            entry.level ===
            LEVELS.ERROR
        ) {
            method =
                "error";
        } else if (
            entry.level ===
            LEVELS.WARN
        ) {
            method =
                "warn";
        } else if (
            entry.level ===
            LEVELS.DEBUG
        ) {
            method =
                "debug";
        } else if (
            entry.level ===
            LEVELS.TRACE
        ) {
            method =
                "debug";
        } else if (
            entry.level ===
            LEVELS.INFO
        ) {
            method =
                "info";
        }

        const consoleMethod =
            typeof console[
                method
            ] === "function"
                ? console[
                      method
                  ]
                : console.log;

        consoleMethod.call(
            console,
            `[TACTIC ${entry.level.toUpperCase()}]`,
            entry.message,
            entry.data ??
                ""
        );

        metrics.consoleWrites +=
            1;

        return true;
    }

    function emitEntry(
        entry
    ) {
        const eventName =
            TACTIC.EVENTS
                ?.LOG
                ?.CREATED ||
            "log:created";

        getEvents()?.emit(
            eventName,
            entry
        );
    }

    function write(
        level,
        message,
        data = null
    ) {
        const normalizedLevel =
            normalizeLevel(
                level
            );

        if (
            !normalizedLevel ||
            normalizedLevel ===
                LEVELS.SILENT
        ) {
            throw new TypeError(
                `Invalid logger level: ${String(level)}`
            );
        }

        metrics.attempted +=
            1;

        if (
            !isEnabled(
                normalizedLevel
            )
        ) {
            metrics.filtered +=
                1;

            return null;
        }

        const entry =
            createEntry(
                normalizedLevel,
                message,
                data
            );

        metrics.written +=
            1;

        metrics.byLevel[
            normalizedLevel
        ] += 1;

        metrics.lastEntryAt =
            entry.timestamp;

        metrics.lastLevel =
            normalizedLevel;

        saveEntry(
            entry
        );

        writeToConsole(
            entry
        );

        emitEntry(
            entry
        );

        return entry;
    }

    function trace(
        message,
        data = null
    ) {
        return write(
            LEVELS.TRACE,
            message,
            data
        );
    }

    function debug(
        message,
        data = null
    ) {
        return write(
            LEVELS.DEBUG,
            message,
            data
        );
    }

    function info(
        message,
        data = null
    ) {
        return write(
            LEVELS.INFO,
            message,
            data
        );
    }

    function warn(
        message,
        data = null
    ) {
        return write(
            LEVELS.WARN,
            message,
            data
        );
    }

    function error(
        message,
        data = null
    ) {
        return write(
            LEVELS.ERROR,
            message,
            data
        );
    }

    function setLevel(
        level,
        options = {}
    ) {
        const normalizedLevel =
            normalizeLevel(
                level
            );

        if (!normalizedLevel) {
            throw new TypeError(
                `Unsupported logger level: ${String(level)}`
            );
        }

        const previousLevel =
            activeLevel;

        activeLevel =
            normalizedLevel;

        metrics.levelChanges +=
            1;

        if (
            options.persist !==
            false
        ) {
            getStorage()?.set(
                LEVEL_STORAGE_KEY,
                activeLevel
            );
        }

        /*
         * This message is intentionally written after changing
         * the level. It will only appear if INFO is enabled under
         * the newly selected level.
         */
        info(
            `Logger level changed: ${previousLevel} → ${activeLevel}`,
            {
                previousLevel,
                level:
                    activeLevel,

                persisted:
                    options.persist !==
                    false,
            }
        );

        return activeLevel;
    }

    function getLevel() {
        return activeLevel;
    }

    function getEntries(
        filters = {}
    ) {
        const storage =
            getStorage();

        const storedLogs =
            storage?.get(
                LOG_STORAGE_KEY,
                []
            );

        let entries =
            Array.isArray(
                storedLogs
            )
                ? [
                      ...storedLogs,
                  ]
                : [];

        if (
            filters.level
        ) {
            const level =
                normalizeLevel(
                    filters.level
                );

            if (!level) {
                return [];
            }

            entries =
                entries.filter(
                    (entry) =>
                        entry.level ===
                        level
                );
        }

        if (
            Number.isFinite(
                filters.since
            )
        ) {
            entries =
                entries.filter(
                    (entry) =>
                        entry.timestamp >=
                        filters.since
                );
        }

        if (
            Number.isSafeInteger(
                filters.limit
            ) &&
            filters.limit > 0
        ) {
            entries =
                entries.slice(
                    -filters.limit
                );
        }

        return entries;
    }

    function clear() {
        const existingCount =
            getEntries().length;

        getStorage()?.remove(
            LOG_STORAGE_KEY
        );

        metrics.clearCount +=
            1;

        const eventName =
            TACTIC.EVENTS
                ?.LOG
                ?.CLEARED ||
            "log:cleared";

        getEvents()?.emit(
            eventName,
            {
                removed:
                    existingCount,

                timestamp:
                    Date.now(),
            }
        );

        return existingCount;
    }

    function inspect() {
        return {
            service:
                "logger",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            enabled:
                loggingEnabled(),

            consoleEnabled:
                consoleEnabled(),

            level:
                activeLevel,

            configuredDefaultLevel:
                getConfiguredDefaultLevel(),

            maximumStoredEntries:
                maximumStoredEntries(),

            storedEntryCount:
                getEntries().length,

            metrics: {
                ...metrics,

                byLevel: {
                    ...metrics.byLevel,
                },
            },

            levels: {
                ...LEVELS,
            },
        };
    }

    TACTIC.services.logger = {
        trace,
        debug,
        info,
        warn,
        error,

        write,

        setLevel,
        getLevel,
        isEnabled,

        getEntries,
        clear,
        inspect,

        levels:
            LEVELS,
    };

    info(
        "Logger service loaded",
        {
            level:
                activeLevel,
        }
    );
})();