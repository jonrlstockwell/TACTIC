(() => {
    "use strict";

    const TACTIC = globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Storage] Namespace is unavailable."
        );
        return;
    }

    function buildKey(key) {
        const prefix =
            TACTIC.config?.storage?.prefix ||
            "tactic";

        return `${prefix}:${String(key)}`;
    }

    function get(key, defaultValue = null) {
        return GM_getValue(
            buildKey(key),
            defaultValue
        );
    }

    function set(key, value) {
        GM_setValue(
            buildKey(key),
            value
        );

        return value;
    }

    function remove(key) {
        GM_deleteValue(
            buildKey(key)
        );
    }

    function has(key) {
        const marker = {
            missing: true,
        };

        return (
            GM_getValue(
                buildKey(key),
                marker
            ) !== marker
        );
    }

    function update(
        key,
        updater,
        defaultValue = null
    ) {
        if (typeof updater !== "function") {
            throw new TypeError(
                "Storage updater must be a function."
            );
        }

        const current =
            get(key, defaultValue);

        const next =
            updater(current);

        set(key, next);

        return next;
    }

    function getJson(
        key,
        defaultValue = null
    ) {
        const value =
            get(key, defaultValue);

        /*
         * GM storage can already preserve objects. This helper
         * also supports older stringified values.
         */
        if (typeof value !== "string") {
            return value;
        }

        try {
            return JSON.parse(value);
        } catch {
            return defaultValue;
        }
    }

    function clearKnownKeys(keys) {
        if (!Array.isArray(keys)) {
            throw new TypeError(
                "clearKnownKeys requires an array."
            );
        }

        for (const key of keys) {
            remove(key);
        }
    }

    TACTIC.services.storage = {
        buildKey,
        get,
        set,
        remove,
        has,
        update,
        getJson,
        clearKnownKeys,
    };

    console.log(
        "[TACTIC Storage] Service loaded"
    );
})();