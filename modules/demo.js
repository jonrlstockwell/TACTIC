(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Demo] Namespace is unavailable."
        );

        return;
    }

    TACTIC.registerModule({
        id: "demo",

        name: "Framework Test",

        icon: "🧪",

        version: "1.0.0",

        order: 999,

        async init({
            logger,
            events,
        }) {
            logger.info(
                "Demo module initialized"
            );

            events.emit(
                "demo:initialized"
            );
        },

        render(
            container,
            {
                components,
            }
        ) {
            const heading =
                components.createElement(
                    "h2",
                    {
                        className:
                            "tactic-page-heading",

                        text:
                            "🧪 Framework Test",
                    }
                );

            const description =
                components.createEmptyState(
                    "The modular interface is working",
                    "This page was registered by an independent module. The drawer discovered it automatically and added it to navigation."
                );

            const versionCard =
                components.createInfoCard(
                    "TACTIC Version",
                    TACTIC.version
                );

            const moduleCard =
                components.createInfoCard(
                    "Registered Modules",
                    String(
                        TACTIC.modules.size
                    )
                );

            const grid =
                components.createElement(
                    "div",
                    {
                        styles: {
                            display: "grid",
                            gap: "10px",
                            marginTop: "12px",
                        },
                    }
                );

            grid.append(
                versionCard,
                moduleCard
            );

            container.append(
                heading,
                description,
                grid
            );
        },

        destroy({
            logger,
        }) {
            logger.info(
                "Demo module destroyed"
            );
        },
    });
})();