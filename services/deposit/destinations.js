/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/deposit/destinations.js
 *
 * Purpose:
 * Provides the centralized destination registry used by the
 * Deposit Service.
 *
 * Responsibilities:
 * - Define supported deposit destinations
 * - Associate destinations with registered DOM page helpers
 * - Store verified destination-specific selector paths
 * - Associate deposit destinations with navigation routes
 * - Describe destination capabilities
 * - Expose destination diagnostics
 *
 * Does NOT:
 * - Navigate directly
 * - Read or modify forms
 * - Submit or confirm deposits
 * - Contain Protection business rules
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Deposit Destinations] Namespace is unavailable."
        );

        return;
    }

    const {
        logger,
        navigation,
    } = TACTIC.services;

    if (!navigation) {
        console.error(
            "[TACTIC Deposit Destinations] Navigation service is unavailable."
        );

        return;
    }

    const DESTINATION_IDS =
        Object.freeze({
            FACTION_BANK:
                "faction-bank",

            PERSONAL_VAULT:
                "personal-vault",

            BANK:
                "bank",
        });

    const destinations =
        new Map();

    const metrics = {
        startedAt:
            Date.now(),

        registrations:
            0,

        lookups:
            0,

        missingLookups:
            0,

        navigationRoutesRegistered:
            0,

        lastDestination:
            null,

        lastActivityAt:
            Date.now(),
    };

    function isPlainObject(
        value
    ) {
        return (
            value !== null &&
            typeof value ===
                "object" &&
            !Array.isArray(
                value
            )
        );
    }

    function normalizeId(
        destinationId
    ) {
        if (
            typeof destinationId !==
                "string" ||
            !destinationId.trim()
        ) {
            throw new TypeError(
                "Deposit destination ID must be a non-empty string."
            );
        }

        const normalized =
            destinationId
                .trim()
                .toLowerCase();

        if (
            !/^[a-z0-9:_-]+$/
                .test(normalized)
        ) {
            throw new TypeError(
                "Deposit destination ID contains unsupported characters."
            );
        }

        return normalized;
    }

    function normalizeOptionalId(
        value
    ) {
        if (
            typeof value !==
                "string" ||
            !value.trim()
        ) {
            return null;
        }

        return normalizeId(
            value
        );
    }

    function normalizeDefinition(
        definition
    ) {
        if (
            !isPlainObject(
                definition
            )
        ) {
            throw new TypeError(
                "Deposit destination definition must be an object."
            );
        }

        const id =
            normalizeId(
                definition.id
            );

        return {
            id,

            name:
                typeof definition.name ===
                    "string" &&
                definition.name.trim()
                    ? definition.name
                          .trim()
                    : id,

            description:
                typeof definition
                    .description ===
                    "string"
                    ? definition
                          .description
                          .trim()
                    : "",

            routeId:
                normalizeOptionalId(
                    definition.routeId
                ),

            routeUrl:
                typeof definition.routeUrl ===
                    "string" &&
                definition.routeUrl.trim()
                    ? definition.routeUrl
                          .trim()
                    : null,

            pageId:
                normalizeOptionalId(
                    definition.pageId
                ),

            helperId:
                normalizeOptionalId(
                    definition.helperId
                ),

            amountSelectorPath:
                typeof definition
                    .amountSelectorPath ===
                    "string" &&
                definition
                    .amountSelectorPath
                    .trim()
                    ? definition
                          .amountSelectorPath
                          .trim()
                    : null,

            submitSelectorPath:
                typeof definition
                    .submitSelectorPath ===
                    "string" &&
                definition
                    .submitSelectorPath
                    .trim()
                    ? definition
                          .submitSelectorPath
                          .trim()
                    : null,

            fillSupported:
                definition.fillSupported ===
                true,

            submitSupported:
                definition.submitSupported ===
                true,

            confirmSupported:
                definition.confirmSupported ===
                true,

            verified:
                definition.verified ===
                true,

            metadata:
                isPlainObject(
                    definition.metadata
                )
                    ? {
                          ...definition.metadata,
                      }
                    : {},

            registeredAt:
                Date.now(),
        };
    }

    function createSnapshot(
        destination
    ) {
        if (!destination) {
            return null;
        }

        return {
            id:
                destination.id,

            name:
                destination.name,

            description:
                destination.description,

            routeId:
                destination.routeId,

            routeUrl:
                destination.routeUrl,

            pageId:
                destination.pageId,

            helperId:
                destination.helperId,

            amountSelectorPath:
                destination
                    .amountSelectorPath,

            submitSelectorPath:
                destination
                    .submitSelectorPath,

            fillSupported:
                destination.fillSupported,

            submitSupported:
                destination.submitSupported,

            confirmSupported:
                destination.confirmSupported,

            verified:
                destination.verified,

            metadata: {
                ...destination.metadata,
            },

            registeredAt:
                destination.registeredAt,
        };
    }

    function matchesPersonalVaultRoute(
        currentRoute
    ) {
        if (!currentRoute) {
            return false;
        }

        return (
            currentRoute.pathname ===
                "/properties.php" &&
            currentRoute
                .hashParameters
                ?.p ===
                "options" &&
            currentRoute
                .hashParameters
                ?.tab ===
                "vault"
        );
    }

    function registerNavigationRoute(
        destination
    ) {
        if (
            !destination.routeId ||
            !destination.routeUrl
        ) {
            return false;
        }

        navigation.register({
            id:
                destination.routeId,

            name:
                destination.name,

            url:
                destination.routeUrl,

            pageId:
                destination.pageId,

            readySelectorPath:
                destination
                    .amountSelectorPath,

            match({
                currentRoute,
            }) {
                if (
                    destination.id ===
                    DESTINATION_IDS
                        .PERSONAL_VAULT
                ) {
                    /*
                     * The property ID can change if the player moves
                     * to another property. Match the Personal Vault
                     * by pathname and stable hash parameters instead
                     * of requiring the current property ID.
                     */
                    return matchesPersonalVaultRoute(
                        currentRoute
                    );
                }

                const target =
                    new URL(
                        destination
                            .routeUrl,
                        globalThis.location
                            .origin
                    );

                return (
                    currentRoute.pathname ===
                        target.pathname &&
                    currentRoute.search ===
                        target.search &&
                    currentRoute.hash ===
                        target.hash
                );
            },

            metadata: {
                type:
                    "deposit-destination",

                destinationId:
                    destination.id,

                helperId:
                    destination.helperId,
            },
        });

        metrics
            .navigationRoutesRegistered +=
            1;

        return true;
    }

    function register(
        definition
    ) {
        const normalized =
            normalizeDefinition(
                definition
            );

        destinations.set(
            normalized.id,
            normalized
        );

        metrics.registrations +=
            1;

        metrics.lastDestination =
            normalized.id;

        metrics.lastActivityAt =
            Date.now();

        registerNavigationRoute(
            normalized
        );

        return createSnapshot(
            normalized
        );
    }

    function get(
        destinationId
    ) {
        metrics.lookups +=
            1;

        const normalizedId =
            normalizeId(
                destinationId
            );

        metrics.lastDestination =
            normalizedId;

        metrics.lastActivityAt =
            Date.now();

        const destination =
            destinations.get(
                normalizedId
            );

        if (!destination) {
            metrics.missingLookups +=
                1;

            return null;
        }

        return createSnapshot(
            destination
        );
    }

    function has(
        destinationId
    ) {
        try {
            return destinations.has(
                normalizeId(
                    destinationId
                )
            );
        } catch {
            return false;
        }
    }

    function list(
        filters = {}
    ) {
        let results = [
            ...destinations.values(),
        ];

        if (
            filters.verified !==
            undefined
        ) {
            results =
                results.filter(
                    (destination) =>
                        destination.verified ===
                        Boolean(
                            filters.verified
                        )
                );
        }

        if (
            filters.fillSupported !==
            undefined
        ) {
            results =
                results.filter(
                    (destination) =>
                        destination
                            .fillSupported ===
                        Boolean(
                            filters
                                .fillSupported
                        )
                );
        }

        if (
            filters.helperId !==
            undefined
        ) {
            const helperId =
                normalizeOptionalId(
                    filters.helperId
                );

            results =
                results.filter(
                    (destination) =>
                        destination.helperId ===
                        helperId
                );
        }

        return results
            .map(
                createSnapshot
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    first.name.localeCompare(
                        second.name
                    )
            );
    }

    function inspect() {
        return {
            service:
                "deposit-destinations",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            destinationCount:
                destinations.size,

            destinations:
                list(),

            supportedForPreparation:
                list({
                    verified:
                        true,

                    fillSupported:
                        true,
                }).map(
                    (destination) =>
                        destination.id
                ),

            helperMappings:
                Object.fromEntries(
                    list().map(
                        (destination) => [
                            destination.id,
                            destination.helperId,
                        ]
                    )
                ),

            metrics: {
                ...metrics,
            },

            ids: {
                ...DESTINATION_IDS,
            },
        };
    }

    register({
        id:
            DESTINATION_IDS
                .FACTION_BANK,

        name:
            "Faction Bank",

        description:
            "Prepares a cash deposit in the faction armoury.",

        routeId:
            "deposit:faction-bank",

        routeUrl:
            "/factions.php?step=your&type=1#/tab=armoury&sub=donate",

        pageId:
            "faction",

        helperId:
            "faction-bank",

        amountSelectorPath:
            "FACTION.DEPOSIT_AMOUNT",

        submitSelectorPath:
            "FACTION.DEPOSIT_BUTTON",

        fillSupported:
            true,

        submitSupported:
            false,

        confirmSupported:
            false,

        verified:
            true,

        metadata: {
            destinationType:
                "faction",

            manualSubmissionRequired:
                true,
        },
    });

    register({
        id:
            DESTINATION_IDS
                .PERSONAL_VAULT,

        name:
            "Personal Vault",

        description:
            "Prepares a deposit into the player's Personal Vault.",

        routeId:
            "deposit:personal-vault",

        /*
         * This URL opens the currently verified property.
         *
         * Route matching intentionally ignores the property ID so
         * TACTIC recognizes another property's Vault page as the
         * same destination. Navigating from another page still uses
         * this configured property URL.
         */
        routeUrl:
            "/properties.php#/p=options&ID=2370381&tab=vault",

        /*
         * The DOM page catalog does not currently define a
         * Properties page. This ID is still useful route metadata
         * and does not prevent helper-based preparation.
         */
        pageId:
            "properties",

        helperId:
            "personal-vault",

        amountSelectorPath:
            "VAULT.DEPOSIT_AMOUNT",

        submitSelectorPath:
            "VAULT.DEPOSIT_BUTTON",

        fillSupported:
            true,

        submitSupported:
            false,

        confirmSupported:
            false,

        verified:
            true,

        metadata: {
            destinationType:
                "personal-property",

            propertyId:
                2370381,

            routeMatchIgnoresPropertyId:
                true,

            manualSubmissionRequired:
                true,
        },
    });

    register({
        id:
            DESTINATION_IDS.BANK,

        name:
            "Bank",

        description:
            "Prepares an investment deposit through Torn's bank.",

        routeId:
            null,

        routeUrl:
            null,

        pageId:
            null,

        helperId:
            null,

        amountSelectorPath:
            null,

        submitSelectorPath:
            null,

        fillSupported:
            false,

        submitSupported:
            false,

        confirmSupported:
            false,

        verified:
            false,

        metadata: {
            destinationType:
                "bank-investment",

            manualSubmissionRequired:
                true,
        },
    });

    TACTIC.services
        .depositDestinations =
        Object.freeze({
            get,
            has,
            list,
            register,
            inspect,

            ids:
                DESTINATION_IDS,
        });

    logger?.info(
        "Deposit destination registry loaded",
        {
            destinationCount:
                destinations.size,

            supportedForPreparation:
                list({
                    verified:
                        true,

                    fillSupported:
                        true,
                }).map(
                    (destination) =>
                        destination.id
                ),
        }
    );
})();