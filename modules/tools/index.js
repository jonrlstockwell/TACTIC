(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Tools] Namespace is unavailable."
        );

        return;
    }

    if (
        typeof TACTIC.registerModule !==
        "function"
    ) {
        console.error(
            "[TACTIC Tools] Module Manager is unavailable."
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
            "[TACTIC Tools] Section Manager framework is unavailable."
        );

        return;
    }

    if (
        !TACTIC.tools ||
        typeof TACTIC.tools !==
            "object"
    ) {
        TACTIC.tools = {};
    }

    const MODULE_ID =
        "tools";

    const SECTION_MANAGER_ID =
        "tools";

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
            "tactic-tools-content";

        const heading =
            document.createElement(
                "h2"
            );

        heading.className =
            "tactic-page-heading";

        heading.textContent =
            "🔧 Tools";

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
                "No tools are available.";

            wrapper.appendChild(
                empty
            );

            container.appendChild(
                wrapper
            );

            return;
        }

        for (
            const section of
            sections
        ) {
            const sectionContainer =
                document.createElement(
                    "section"
                );

            sectionContainer.className =
                [
                    "tactic-application-section",
                    "tactic-tools-section",
                    `tactic-tools-section-${section.id}`,
                ].join(
                    " "
                );

            sectionContainer.setAttribute(
                "data-tactic-application",
                MODULE_ID
            );

            sectionContainer.setAttribute(
                "data-tactic-section",
                section.id
            );

            wrapper.appendChild(
                sectionContainer
            );

            await sectionManager
                .renderSection(
                    section.id,
                    sectionContainer,
                    {
                        rootContainer:
                            container,

                        application:
                            MODULE_ID,
                    }
                );
        }

        container.appendChild(
            wrapper
        );
    }

    const toolsApi =
        Object.freeze({
            sections:
                sectionManager,

            registerSection,

            unregisterSection,

            getSections,

            inspect,
        });

    Object.assign(
        TACTIC.tools,
        toolsApi
    );

    TACTIC.registerModule({
        id:
            MODULE_ID,

        name:
            "Tools",

        icon:
            "🔧",

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
                    "module:tools",

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
                "Tools application initialized",
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
                "Tools application destroyed"
            );
        },
    });

    logger?.info(
        "Tools application loaded",
        {
            moduleId:
                MODULE_ID,

            version:
                MODULE_VERSION,
        }
    );
})();