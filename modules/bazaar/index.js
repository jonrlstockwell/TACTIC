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

    if (
        typeof TACTIC.registerModule !==
        "function"
    ) {
        console.error(
            "[TACTIC Bazaar] Module Manager is unavailable."
        );

        return;
    }

    if (
        typeof TACTIC.createSectionManager !==
            "function" ||
        typeof TACTIC.getSectionManager !==
            "function"
    ) {
        console.error(
            "[TACTIC Bazaar] Section Manager framework is unavailable."
        );

        return;
    }

    if (
        !TACTIC.bazaar ||
        typeof TACTIC.bazaar !==
            "object"
    ) {
        TACTIC.bazaar = {};
    }

    const MODULE_ID =
        "bazaar";

    const SECTION_MANAGER_ID =
        "bazaar";

    const MODULE_VERSION =
        "1.0.0";

    const MODULE_ORDER =
        250;

    const services =
        TACTIC.services ||
        {};

    const logger =
        services.logger;

    const health =
        services.health;

    const sectionManager =
        TACTIC.getSectionManager(
            SECTION_MANAGER_ID
        ) ||
        TACTIC.createSectionManager(
            SECTION_MANAGER_ID
        );

    let initialized =
        false;

    let initializedAt =
        null;

    let destroyedAt =
        null;

    function getSections() {
        return sectionManager.getAll({
            includeDisabled:
                false,
        });
    }

    function registerSection(
        definition
    ) {
        return sectionManager.register(
            definition
        );
    }

    function unregisterSection(
        sectionId
    ) {
        return sectionManager.unregister(
            sectionId
        );
    }

    function inspect() {
        return {
            moduleId:
                MODULE_ID,

            version:
                MODULE_VERSION,

            initialized,

            initializedAt,

            destroyedAt,

            sectionCount:
                getSections()
                    .length,

            sections:
                getSections()
                    .map(
                        section => ({
                            id:
                                section.id,

                            name:
                                section.name,

                            icon:
                                section.icon,

                            order:
                                section.order,

                            enabled:
                                section.enabled !==
                                false,
                        })
                    ),
        };
    }

    async function render(
        container
    ) {
        if (!container) {
            return;
        }

        const sections =
            getSections();

        container.replaceChildren();

        const wrapper =
            document.createElement(
                "div"
            );

        wrapper.className =
            "tactic-bazaar-content";

        const heading =
            document.createElement(
                "h2"
            );

        heading.className =
            "tactic-page-heading";

        heading.textContent =
            "🛒 Bazaar";

        wrapper.appendChild(
            heading
        );

        if (
            sections.length ===
            0
        ) {
            const empty =
                document.createElement(
                    "div"
                );

            empty.textContent =
                "No Bazaar sections are available.";

            wrapper.appendChild(
                empty
            );

            container.appendChild(
                wrapper
            );

            return;
        }

        /*
         * V1 has one section: Listing Helper.
         *
         * Once Bazaar gains multiple sections we can add the same
         * tabbed-navigation pattern used by Finance.
         */
        const primarySection =
            sections[0];

        const sectionContainer =
            document.createElement(
                "div"
            );

        wrapper.appendChild(
            sectionContainer
        );

        container.appendChild(
            wrapper
        );

        await primarySection.render(
            sectionContainer
        );
    }

    const bazaarApi =
        Object.freeze({
            sections:
                sectionManager,

            registerSection,

            unregisterSection,

            getSections,

            inspect,
        });

    Object.assign(
        TACTIC.bazaar,
        bazaarApi
    );

    TACTIC.registerModule({
        id:
            MODULE_ID,

        name:
            "Bazaar",

        icon:
            "🛒",

        version:
            MODULE_VERSION,

        order:
            MODULE_ORDER,

        async init() {
            if (initialized) {
                return inspect();
            }

            initialized =
                true;

            initializedAt =
                Date.now();

            destroyedAt =
                null;

            health?.register?.({
                name:
                    "module:bazaar",

                type:
                    health.types
                        ?.MODULE ||
                    "module",

                status:
                    TACTIC
                        .HEALTH_STATES
                        ?.HEALTHY ||
                    "healthy",

                staleAfterMs:
                    null,

                metadata: {
                    moduleId:
                        MODULE_ID,

                    version:
                        MODULE_VERSION,

                    sectionManagerId:
                        SECTION_MANAGER_ID,

                    sectionCount:
                        getSections()
                            .length,

                    requiresHeartbeat:
                        false,
                },
            });

            logger?.info(
                "Bazaar application initialized",
                {
                    sectionCount:
                        getSections()
                            .length,
                }
            );

            return inspect();
        },

        async render(
            container
        ) {
            return render(
                container
            );
        },

        destroy() {
            initialized =
                false;

            destroyedAt =
                Date.now();

            logger?.info(
                "Bazaar application destroyed"
            );
        },
    });

    logger?.info(
        "Bazaar application loaded",
        {
            moduleId:
                MODULE_ID,

            version:
                MODULE_VERSION,
        }
    );
})();