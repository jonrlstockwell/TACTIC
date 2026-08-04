/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/pages.js
 *
 * Purpose:
 * Identifies the current Torn page using the browser URL.
 *
 * Responsibilities:
 * - Normalize Torn URLs
 * - Identify known Torn pages
 * - Return consistent page records
 * - Expose route inspection helpers
 *
 * Does NOT:
 * - Watch for navigation changes
 * - Manipulate browser history
 * - Query page content
 *
 * Public API:
 * - TACTIC.services.dom.pageIds
 * - TACTIC.services.dom.detectPage()
 * - TACTIC.services.dom.getRoute()
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

    function deepFreeze(value) {
        if (
            value === null ||
            typeof value !== "object" ||
            Object.isFrozen(value)
        ) {
            return value;
        }

        Object.freeze(value);

        for (
            const nestedValue of
            Object.values(value)
        ) {
            deepFreeze(
                nestedValue
            );
        }

        return value;
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
            urlValue instanceof URL
        ) {
            return new URL(
                urlValue.href
            );
        }

        return new URL(
            String(urlValue),
            globalThis.location.origin
        );
    }

    function getRoute(
        urlValue =
            globalThis.location.href
    ) {
        const url =
            toUrl(
                urlValue
            );

        return {
            href:
                url.href,

            origin:
                url.origin,

            pathname:
                url.pathname.toLowerCase(),

            search:
                url.search,

            hash:
                url.hash,

            query:
                Object.fromEntries(
                    url.searchParams.entries()
                ),

            hashParameters:
                parseHashParameters(
                    url.hash
                ),
        };
    }

    function parseHashParameters(
        hash
    ) {
        const normalized =
            String(hash || "")
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
            normalized.indexOf("?");

        const parameterText =
            queryIndex >= 0
                ? normalized.slice(
                      queryIndex + 1
                  )
                : normalized;

        const parameters =
            new URLSearchParams(
                parameterText
            );

        return Object.fromEntries(
            parameters.entries()
        );
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
                    route.query[key] !==
                    expectedValue
                ) {
                    return false;
                }
            }
        }

        if (
            definition.hashIncludes
        ) {
            const includes =
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
                !includes.every(
                    (part) =>
                        route.hash.includes(
                            part
                        )
                )
            ) {
                return false;
            }
        }

        return true;
    }

    function detectPage(
        urlValue =
            globalThis.location.href
    ) {
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

        if (!definition) {
            return {
                id:
                    PAGE_IDS.UNKNOWN,

                name:
                    "Unknown",

                known:
                    false,

                route,
            };
        }

        return {
            id:
                definition.id,

            name:
                definition.name,

            known:
                true,

            route,
        };
    }

    dom.pageIds =
        PAGE_IDS;

    dom.pageDefinitions =
        PAGE_DEFINITIONS;

    dom.getRoute =
        getRoute;

    dom.detectPage =
        detectPage;

    logger?.info(
        "DOM page definitions loaded"
    );
})();