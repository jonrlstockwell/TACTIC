(() => {
    "use strict";

    const TACTIC = globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Logger] Namespace is unavailable."
        );
        return;
    }

    const STORAGE_KEY = "core:logs";

    function createEntry(
        level,
        message,
        data = null
    ) {
        return {
            timestamp: Date.now(),
            isoTime:
                new Date().toISOString(),
            level,
            message: String(message),
            data,
        };
    }

    function saveEntry(entry) {
        const config =
            TACTIC.config.logging;

        if (!config.enabled) {
            return;
        }

        const storage =
            TACTIC.services.storage;

        const logs =
            storage.get(
                STORAGE_KEY,
                []
            );

        const safeLogs =
            Array.isArray(logs)
                ? logs
                : [];

        safeLogs.push(entry);

        storage.set(
            STORAGE_KEY,
            safeLogs.slice(
                -config.maximumStoredEntries
            )
        );
    }

    function write(
        level,
        message,
        data = null
    ) {
        const entry =
            createEntry(
                level,
                message,
                data
            );

        saveEntry(entry);

        if (
            TACTIC.config.logging
                .consoleEnabled
        ) {
            const method =
                level === "error"
                    ? "error"
                    : level === "warn"
                      ? "warn"
                      : "log";

            console[method](
                `[TACTIC ${level.toUpperCase()}]`,
                message,
                data ?? ""
            );
        }

        TACTIC.services.events?.emit(
            "log:created",
            entry
        );

        return entry;
    }

    function debug(message, data = null) {
        return write(
            "debug",
            message,
            data
        );
    }

    function info(message, data = null) {
        return write(
            "info",
            message,
            data
        );
    }

    function warn(message, data = null) {
        return write(
            "warn",
            message,
            data
        );
    }

    function error(message, data = null) {
        return write(
            "error",
            message,
            data
        );
    }

    function getEntries() {
        const logs =
            TACTIC.services.storage.get(
                STORAGE_KEY,
                []
            );

        return Array.isArray(logs)
            ? logs
            : [];
    }

    function clear() {
        TACTIC.services.storage.remove(
            STORAGE_KEY
        );

        TACTIC.services.events?.emit(
            "log:cleared"
        );
    }

    TACTIC.services.logger = {
        debug,
        info,
        warn,
        error,
        getEntries,
        clear,
    };

    info("Logger service loaded");
})();