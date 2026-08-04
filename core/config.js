(() => {
    "use strict";

    const TACTIC = globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Config] Namespace is unavailable."
        );
        return;
    }

    /*
     * Shared defaults used throughout TACTIC.
     *
     * Feature-specific settings will eventually live inside
     * their respective modules. This object contains only
     * application-wide configuration.
     */
    TACTIC.config = {
        app: {
            name: "TACTIC",
            fullName:
                "Torn Assistant & Companion Toolkit",
            version: TACTIC.version,
            environment: "development",
        },

        ui: {
            drawerWidthPx: 420,
            animationDurationMs: 250,
            edgeTabPositionPercent: 45,
        },

        logging: {
            enabled: true,
            consoleEnabled: true,
            maximumStoredEntries: 500,
        },

        storage: {
            prefix: "tactic",
        },
    };

    console.log(
        "[TACTIC Config] Configuration loaded",
        TACTIC.config
    );
})();