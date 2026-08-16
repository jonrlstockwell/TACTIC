(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Bazaar] Namespace is unavailable."
        );

        return;
    }

    const moduleManager =
        TACTIC.services
            ?.moduleManager;

    const sectionManager =
        TACTIC.services
            ?.sectionManager;

    const logger =
        TACTIC.services
            ?.logger;

    const MODULE_ID =
        "bazaar";

    const MODULE_TITLE =
        "Bazaar";

    const MODULE_ICON =
        "🛒";

    const existingModule =
        moduleManager
            ?.get?.(
                MODULE_ID
            );

    if (!existingModule) {
        moduleManager
            ?.register?.({
                id:
                    MODULE_ID,

                title:
                    MODULE_TITLE,

                label:
                    MODULE_TITLE,

                icon:
                    MODULE_ICON,

                order:
                    30,

                description:
                    "Bazaar listing and pricing tools.",
            });
    }

    TACTIC.modules =
        TACTIC.modules ||
        {};

    TACTIC.modules.bazaar = {
        id:
            MODULE_ID,

        title:
            MODULE_TITLE,

        icon:
            MODULE_ICON,

        getSection(
            sectionId
        ) {
            return sectionManager
                ?.get?.(
                    MODULE_ID,
                    sectionId
                ) ??
                null;
        },

        inspect() {
            return {
                moduleId:
                    MODULE_ID,

                title:
                    MODULE_TITLE,

                registered:
                    Boolean(
                        moduleManager
                            ?.get?.(
                                MODULE_ID
                            )
                    ),

                sections:
                    sectionManager
                        ?.list?.(
                            MODULE_ID
                        ) ??
                    [],
            };
        },
    };

    logger?.info(
        "Bazaar module loaded",
        {
            moduleId:
                MODULE_ID,
        }
    );
})();