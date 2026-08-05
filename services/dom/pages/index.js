/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/pages/index.js
 *
 * Purpose:
 * Provides centralized Torn page detection, route inspection,
 * and registration of page-specific DOM helpers.
 *
 * Responsibilities:
 * - Normalize Torn URLs
 * - Identify known Torn pages
 * - Return consistent page records
 * - Register page-specific DOM helper namespaces
 * - Preserve compatibility with the original DOM page API
 * - Expose page-layer diagnostics
 *
 * Does NOT:
 * - Watch for navigation changes
 * - Manipulate browser history
 * - Submit forms
 * - Confirm transactions
 * - Contain application business rules
 *
 * Public API:
 * - TACTIC.services.dom.pages.ids
 * - TACTIC.services.dom.pages.definitions
 * - TACTIC.services.dom.pages.getRoute()
 * - TACTIC.services.dom.pages.detect()
 * - TACTIC.services.dom.pages.registerHelper()
 * - TACTIC.services.dom.pages.unregisterHelper()
 * - TACTIC.services.dom.pages.hasHelper()
 * - TACTIC.services.dom.pages.getHelper()
 * - TACTIC.services.dom.pages.listHelpers()
 * - TACTIC.services.dom.pages.inspect()
 *
 * Compatibility API:
 * - TACTIC.services.dom.pageIds
 * - TACTIC.services.dom.pageDefinitions
 * - TACTIC.services.dom.getRoute()
 * - TACTIC.services.dom.detectPage()
 *
 * Dependencies:
 * - services/dom/index.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC DOM Pages] Namespace is unavailable."
        );

        return;
    }

    const dom =
        TACTIC.services.dom;

    const logger =
        TACTIC.services.logger;

    if (!dom) {
        console.error(
            "[TACTIC DOM Pages] DOM service is unavailable."
        );

        return;
    }

    const helperRegistry =
        new Map();

    const metrics = {
        loadedAt:
            Date.now(),

        routeReads:
            0,

        pageDetections:
            0,

        knownPageDetections:
            0,

        unknownPageDetections:
            0,

        helperRegistrations:
            0,

        helperReplacements:
            0,

        helperUnregistrations:
            0,

        helperReads:
            0,

        lastDetectedPageId:
            null,

        lastDetectedAt:
            null,

        lastRoute:
            null,

        lastHelperId:
            null,
    };

    function deepFreeze(
        value
    ) {
        if (
            value === null ||
            typeof value !==
                "object" ||
            Object.isFrozen(
                value
            )
        ) {
            return value;
        }

        Object.freeze(
            value
        );

        for (
            const nestedValue of
            Object.values(
                value
            )
        ) {
            deepFreeze(
                nestedValue
            );
        }

        return value;
    }

    function normalizeHelperId(
        value
    ) {
        if (
            typeof value !==
                "string" ||
            !value.trim()
        ) {
            throw new TypeError(
                "DOM page-helper ID must be a non-empty string."
            );
        }

        const normalized =
            value
                .trim()
                .toLowerCase();

        if (
            !/^[a-z0-9._:-]+$/
                .test(
                    normalized
                )
        ) {
            throw new TypeError(
                "DOM page-helper ID contains unsupported characters."
            );
        }

        return normalized;
    }

    const PAGE_IDS =
        deepFreeze({
            UNKNOWN:
                "unknown",

            HOME:
                "home",

            FACTION:
                "faction",

            ITEM_MARKET:
                "item-market",

            BAZAAR:
                "bazaar",

            TRAVEL_AGENCY:
                "travel-agency",

            GYM:
                "gym",

            CITY:
                "city",

            HOSPITAL:
                "hospital",

            STOCKS:
                "stocks",

            COMPANY:
                "company",

            MESSAGES:
                "messages",

            PROFILE:
                "profile",
        });

    const PAGE_DEFINITIONS =
        deepFreeze([
            {
                id:
                    PAGE_IDS.FACTION,

                name:
                    "Faction",

                paths: [
                    "/factions.php",
                ],
            },

            {
                id:
                    PAGE_IDS.ITEM_MARKET,

                name:
                    "Item Market",

                paths: [
                    "/imarket.php",
                ],
            },

            {
                id:
                    PAGE_IDS.BAZAAR,

                name:
                    "Bazaar",

                paths: [
                    "/bazaar.php",
                ],
            },

            {
                id:
                    PAGE_IDS.TRAVEL_AGENCY,

                name:
                    "Travel Agency",

                paths: [
                    "/travelagency.php",
                ],
            },

            {
                id:
                    PAGE_IDS.GYM,

                name:
                    "Gym",

                paths: [
                    "/gym.php",
                ],
            },

            {
                id:
                    PAGE_IDS.CITY,

                name:
                    "City",

                paths: [
                    "/city.php",
                ],
            },

            {
                id:
                    PAGE_IDS.HOSPITAL,

                name:
                    "Hospital",

                paths: [
                    "/hospitalview.php",
                ],
            },

            {
                id:
                    PAGE_IDS.COMPANY,

                name:
                    "Company",

                paths: [
                    "/companies.php",
                    "/company.php",
                ],
            },

            {
                id:
                    PAGE_IDS.MESSAGES,

                name:
                    "Messages",

                paths: [
                    "/messages.php",
                ],
            },

            {
                id:
                    PAGE_IDS.PROFILE,

                name:
                    "Profile",

                paths: [
                    "/profiles.php",
                ],
            },

            {
                id:
                    PAGE_IDS.STOCKS,

                name:
                    "Stocks",

                paths: [
                    "/stocks.php",
                ],

                queryMatches: {
                    sid:
                        "stocks",
                },
            },

            {
                id:
                    PAGE_IDS.STOCKS,

                name:
                    "Stocks",

                paths: [
                    "/page.php",
                ],

                queryMatches: {
                    sid:
                        "stocks",
                },
            },

            {
                id:
                    PAGE_IDS.HOME,

                name:
                    "Home",

                paths: [
                    "/",
                    "/index.php",
                ],
            },
        ]);

    function toUrl(
        urlValue =
            globalThis.location.href
    ) {
        if (
            urlValue instanceof
            URL
        ) {
            return new URL(
                urlValue.href
            );
        }

        return new URL(
            String(
                urlValue
            ),
            globalThis.location
                .origin
        );
    }

    function parseHashParameters(
        hash
    ) {
        const normalized =
            String(
                hash ||
                ""
            )
                .replace(
                    /^#/,
                    ""
                )
                .replace(
                    /^\//,
                    ""
                );

        if (!normalized) {
            return {};
        }

        const queryIndex =
            normalized.indexOf(
                "?"
            );

        const parameterText =
            queryIndex >= 0
                ? normalized.slice(
                      queryIndex + 1
                  )
                : normalized;

        return Object.fromEntries(
            new URLSearchParams(
                parameterText
            ).entries()
        );
    }

    function getRoute(
        urlValue =
            globalThis.location.href
    ) {
        metrics.routeReads +=
            1;

        const url =
            toUrl(
                urlValue
            );

        const route = {
            href:
                url.href,

            origin:
                url.origin,

            pathname:
                url.pathname
                    .toLowerCase(),

            search:
                url.search,

            hash:
                url.hash,

            query:
                Object.fromEntries(
                    url.searchParams
                        .entries()
                ),

            hashParameters:
                parseHashParameters(
                    url.hash
                ),
        };

        metrics.lastRoute = {
            ...route,

            query: {
                ...route.query,
            },

            hashParameters: {
                ...route
                    .hashParameters,
            },
        };

        return route;
    }

    function matchesDefinition(
        definition,
        route
    ) {
        const pathMatches =
            !definition.paths ||
            definition.paths.includes(
                route.pathname
            );

        if (!pathMatches) {
            return false;
        }

        if (
            definition.queryMatches
        ) {
            for (
                const [
                    key,
                    expectedValue,
                ] of Object.entries(
                    definition
                        .queryMatches
                )
            ) {
                if (
                    route.query[
                        key
                    ] !==
                    expectedValue
                ) {
                    return false;
                }
            }
        }

        if (
            definition.hashIncludes
        ) {
            const requiredParts =
                Array.isArray(
                    definition
                        .hashIncludes
                )
                    ? definition
                          .hashIncludes
                    : [
                          definition
                              .hashIncludes,
                      ];

            if (
                !requiredParts.every(
                    (part) =>
                        route.hash
                            .includes(
                                part
                            )
                )
            ) {
                return false;
            }
        }

        return true;
    }

    function detect(
        urlValue =
            globalThis.location.href
    ) {
        metrics.pageDetections +=
            1;

        const route =
            getRoute(
                urlValue
            );

        const definition =
            PAGE_DEFINITIONS.find(
                (candidate) =>
                    matchesDefinition(
                        candidate,
                        route
                    )
            );

        const result =
            definition
                ? {
                      id:
                          definition.id,

                      name:
                          definition.name,

                      known:
                          true,

                      route,
                  }
                : {
                      id:
                          PAGE_IDS.UNKNOWN,

                      name:
                          "Unknown",

                      known:
                          false,

                      route,
                  };

        if (
            result.known
        ) {
            metrics
                .knownPageDetections +=
                1;
        } else {
            metrics
                .unknownPageDetections +=
                1;
        }

        metrics.lastDetectedPageId =
            result.id;

        metrics.lastDetectedAt =
            Date.now();

        return result;
    }

    function registerHelper(
        helperId,
        helper,
        options = {}
    ) {
        const id =
            normalizeHelperId(
                helperId
            );

        if (
            helper === null ||
            typeof helper !==
                "object"
        ) {
            throw new TypeError(
                `DOM page helper "${id}" must be an object.`
            );
        }

        const exists =
            helperRegistry.has(
                id
            );

        if (
            exists &&
            options.replace !==
                true
        ) {
            throw new Error(
                `DOM page helper "${id}" is already registered.`
            );
        }

        const storedHelper =
            Object.freeze(
                helper
            );

        helperRegistry.set(
            id,
            storedHelper
        );

        if (exists) {
            metrics
                .helperReplacements +=
                1;
        } else {
            metrics
                .helperRegistrations +=
                1;
        }

        metrics.lastHelperId =
            id;

        logger?.debug(
            `DOM page helper registered: ${id}`
        );

        return storedHelper;
    }

    function unregisterHelper(
        helperId
    ) {
        const id =
            normalizeHelperId(
                helperId
            );

        const removed =
            helperRegistry.delete(
                id
            );

        if (removed) {
            metrics
                .helperUnregistrations +=
                1;

            metrics.lastHelperId =
                id;
        }

        return removed;
    }

    function hasHelper(
        helperId
    ) {
        try {
            return helperRegistry.has(
                normalizeHelperId(
                    helperId
                )
            );
        } catch {
            return false;
        }
    }

    function getHelper(
        helperId
    ) {
        metrics.helperReads +=
            1;

        const id =
            normalizeHelperId(
                helperId
            );

        metrics.lastHelperId =
            id;

        return (
            helperRegistry.get(
                id
            ) ||
            null
        );
    }

    function listHelpers() {
        return [
            ...helperRegistry.keys(),
        ].sort();
    }

    function inspect() {
        return {
            subsystem:
                "dom-pages",

            loadedAt:
                metrics.loadedAt,

            uptimeMs:
                Date.now() -
                metrics.loadedAt,

            currentPage:
                detect(),

            helperCount:
                helperRegistry.size,

            helpers:
                listHelpers(),

            pageDefinitionCount:
                PAGE_DEFINITIONS.length,

            pageIds: {
                ...PAGE_IDS,
            },

            metrics: {
                ...metrics,

                lastRoute:
                    metrics.lastRoute
                        ? {
                              ...metrics
                                  .lastRoute,

                              query: {
                                  ...metrics
                                      .lastRoute
                                      .query,
                              },

                              hashParameters: {
                                  ...metrics
                                      .lastRoute
                                      .hashParameters,
                              },
                          }
                        : null,
            },
        };
    }

    const pages =
        Object.freeze({
            ids:
                PAGE_IDS,

            definitions:
                PAGE_DEFINITIONS,

            getRoute,
            detect,

            registerHelper,
            unregisterHelper,
            hasHelper,
            getHelper,
            listHelpers,

            inspect,
        });

    /*
     * New organized API.
     */
    dom.pages =
        pages;

    /*
     * Compatibility aliases.
     *
     * Existing modules can continue using the original API while
     * new code migrates to dom.pages.
     */
    dom.pageIds =
        PAGE_IDS;

    dom.pageDefinitions =
        PAGE_DEFINITIONS;

    dom.getRoute =
        getRoute;

    dom.detectPage =
        detect;

    logger?.info(
        "DOM page subsystem loaded",
        {
            pageDefinitionCount:
                PAGE_DEFINITIONS.length,
        }
    );
})();