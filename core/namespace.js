(() => {
    "use strict";

    /*
     * Create one shared TACTIC object used by the loader,
     * core services, interface, and feature modules.
     */
    if (globalThis.TACTIC) {
        console.warn(
            "[TACTIC] Namespace already exists; duplicate initialization skipped."
        );

        return;
    }

    globalThis.TACTIC = {
        name: "TACTIC",
        fullName: "Torn Assistant & Companion Toolkit",
        version: "0.2.0-dev",

        config: {},
        state: {},
        services: {},
        modules: new Map(),
        pages: new Map(),

        initialized: false,
    };

    console.log(
        `[TACTIC] Namespace ${globalThis.TACTIC.version} created`
    );
})();