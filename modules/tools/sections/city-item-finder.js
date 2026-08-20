(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC City Item Finder] Namespace is unavailable."
        );

        return;
    }

    const components =
        TACTIC.services
            ?.components;

    const logger =
        TACTIC.services
            ?.logger;

    const MODULE_ID =
        "tools";

    const SECTION_ID =
        "city-item-finder";

    const MAP_SELECTOR =
        "#map";

    const ITEM_SELECTOR =
        ".tt-city-item-overlay.city-item";

    const HIGHLIGHT_CLASS =
        "tactic-city-item-highlight";

    const state = {
        enabled:
            false,

        observer:
            null,

        observedMap:
            null,

        detectedCount:
            0,

        lastRefreshAt:
            null,
    };

    function getMap() {
        return document.querySelector(
            MAP_SELECTOR
        );
    }

    function getItems() {
        return [
            ...document.querySelectorAll(
                ITEM_SELECTOR
            ),
        ];
    }

    function applyHighlights() {
        const items =
            getItems();

        for (
            const item of
            items
        ) {
            item.classList.add(
                HIGHLIGHT_CLASS
            );
        }

        state.detectedCount =
            items.length;

        state.lastRefreshAt =
            Date.now();

        return items;
    }

    function removeHighlights() {
        document
            .querySelectorAll(
                `${ITEM_SELECTOR}.${HIGHLIGHT_CLASS}`
            )
            .forEach(
                item => {
                    item.classList.remove(
                        HIGHLIGHT_CLASS
                    );
                }
            );

        state.detectedCount =
            0;
    }

    function stopObserver() {
        if (
            state.observer
        ) {
            state.observer
                .disconnect();

            state.observer =
                null;
        }

        state.observedMap =
            null;
    }

    function startObserver() {
        const map =
            getMap();

        if (!map) {
            stopObserver();

            return false;
        }

        if (
            state.observer &&
            state.observedMap ===
                map
        ) {
            return true;
        }

        stopObserver();

        state.observedMap =
            map;

        state.observer =
            new MutationObserver(
                mutations => {
                    if (
                        !state.enabled
                    ) {
                        return;
                    }

                    let shouldRefresh =
                        false;

                    for (
                        const mutation of
                        mutations
                    ) {
                        if (
                            mutation.type !==
                            "childList"
                        ) {
                            continue;
                        }

                        if (
                            mutation.addedNodes
                                .length >
                            0 ||
                            mutation.removedNodes
                                .length >
                            0
                        ) {
                            shouldRefresh =
                                true;

                            break;
                        }
                    }

                    if (
                        shouldRefresh
                    ) {
                        applyHighlights();
                    }
                }
            );

        state.observer.observe(
            map,
            {
                childList:
                    true,

                subtree:
                    true,
            }
        );

        return true;
    }

    function refresh() {
        if (
            !state.enabled
        ) {
            removeHighlights();

            return [];
        }

        const map =
            getMap();

        if (!map) {
            stopObserver();

            state.detectedCount =
                0;

            return [];
        }

        startObserver();

        return applyHighlights();
    }

    function setEnabled(
        enabled
    ) {
        state.enabled =
            enabled ===
            true;

        if (
            state.enabled
        ) {
            refresh();
        } else {
            stopObserver();

            removeHighlights();
        }

        logger?.info(
            "City Item Finder toggled",
            {
                enabled:
                    state.enabled,

                detectedCount:
                    state.detectedCount,
            }
        );
    }

    function ensurePageLifecycle() {
        /*
         * Torn can replace the City map DOM during navigation.
         * Recheck periodically so the observer follows the new map.
         */
        globalThis.setInterval(
            () => {
                if (
                    !state.enabled
                ) {
                    return;
                }

                const map =
                    getMap();

                if (
                    !map
                ) {
                    stopObserver();

                    state.detectedCount =
                        0;

                    return;
                }

                if (
                    state.observedMap !==
                    map
                ) {
                    refresh();

                    return;
                }

                const currentCount =
                    getItems()
                        .length;

                if (
                    currentCount !==
                    state.detectedCount
                ) {
                    applyHighlights();
                }
            },
            1000
        );
    }

    function render(
        container
    ) {
        if (
            !container ||
            !components
        ) {
            return;
        }

        /*
         * Refresh state whenever Tools renders.
         */
        if (
            state.enabled
        ) {
            refresh();
        }

        components.clearElement(
            container
        );

        const root =
            components.createElement(
                "div",
                {
                    className:
                        "tactic-tool-card",
                }
            );

        root.append(
            components.createElement(
                "div",
                {
                    className:
                        "tactic-tool-title",

                    text:
                        "🗺️ City Map Item Finder",
                }
            ),

            components.createElement(
                "div",
                {
                    className:
                        "tactic-tool-description",

                    text:
                        "Enlarge collectible City map items so they are easier to see and click.",
                }
            )
        );

        const toggleRow =
            components.createElement(
                "div",
                {
                    className:
                        "tactic-city-item-toggle-row",
                }
            );

        toggleRow.appendChild(
            components.createElement(
                "div",
                {
                    className:
                        "tactic-city-item-toggle-label",

                    text:
                        "Item Finder",
                }
            )
        );

        const toggle =
            components.createElement(
                "label",
                {
                    className:
                        "tactic-city-item-switch",
                }
            );

        const checkbox =
            components.createElement(
                "input",
                {
                    attributes: {
                        type:
                            "checkbox",
                    },
                }
            );

        checkbox.checked =
            state.enabled;

        const slider =
            components.createElement(
                "span",
                {
                    className:
                        "tactic-city-item-switch-slider",
                }
            );

        checkbox.addEventListener(
            "change",
            () => {
                setEnabled(
                    checkbox.checked
                );

                render(
                    container
                );
            }
        );

        toggle.append(
            checkbox,
            slider
        );

        toggleRow.appendChild(
            toggle
        );

        root.appendChild(
            toggleRow
        );

        const status =
            components.createElement(
                "div",
                {
                    className:
                        "tactic-tool-status",
                }
            );

        status.append(
            components.createElement(
                "div",
                {
                    text:
                        state.enabled
                            ? "Finder enabled"
                            : "Finder disabled",
                }
            ),

            components.createElement(
                "div",
                {
                    text:
                        state.enabled
                            ? `${state.detectedCount} collectible${
                                  state.detectedCount ===
                                  1
                                      ? ""
                                      : "s"
                              } highlighted`
                            : "No map modifications active",
                }
            )
        );

        root.appendChild(
            status
        );

        container.appendChild(
            root
        );
    }

    ensurePageLifecycle();

    const section = {
        id:
            SECTION_ID,

        moduleId:
            MODULE_ID,

        name:
            "City Map Item Finder",

        icon:
            "🗺️",

        enabled:
            true,

        order:
            20,

        render,

        setEnabled,

        refresh,

        inspect() {
            return {
                moduleId:
                    MODULE_ID,

                sectionId:
                    SECTION_ID,

                enabled:
                    state.enabled,

                observerActive:
                    Boolean(
                        state.observer
                    ),

                mapPresent:
                    Boolean(
                        getMap()
                    ),

                detectedCount:
                    state.detectedCount,

                lastRefreshAt:
                    state.lastRefreshAt,

                highlightedItems:
                    getItems()
                        .filter(
                            item =>
                                item.classList
                                    .contains(
                                        HIGHLIGHT_CLASS
                                    )
                        )
                        .map(
                            item => ({
                                itemId:
                                    item.dataset
                                        ?.itemId ||
                                    null,

                                entryId:
                                    item.dataset
                                        ?.entryId ||
                                    null,

                                className:
                                    item.className,
                            })
                        ),
            };
        },
    };

    if (
        !TACTIC.tools ||
        typeof TACTIC.tools
            .registerSection !==
            "function"
    ) {
        console.error(
            "[TACTIC City Item Finder] Tools application is unavailable."
        );

        return;
    }

    TACTIC.tools.registerSection(
        section
    );

    TACTIC.modules =
        TACTIC.modules ||
        {};

    TACTIC.modules.tools =
        TACTIC.modules.tools ||
        {};

    TACTIC.modules
        .tools
        .cityItemFinder =
        section;

    logger?.info(
        "City Map Item Finder loaded"
    );
})();