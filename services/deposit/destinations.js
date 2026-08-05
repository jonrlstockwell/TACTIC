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
 * - Store verified destination-specific selectors
 * - Describe destination capabilities
 * - Allow future destination adapters to be registered
 * - Expose destination diagnostics
 *
 * Does NOT:
 * - Navigate
 * - Read or modify deposit forms
 * - Submit or confirm deposits
 * - Contain Protection business rules
 *
 * Public API:
 * - TACTIC.services.depositDestinations.get()
 * - TACTIC.services.depositDestinations.has()
 * - TACTIC.services.depositDestinations.list()
 * - TACTIC.services.depositDestinations.register()
 * - TACTIC.services.depositDestinations.inspect()
 *
 * Dependencies:
 * - core/logger.js
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

    const logger =
        TACTIC.services.logger;

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

            pageId:
                typeof definition.pageId ===
                    "string" &&
                definition.pageId.trim()
                    ? definition.pageId
                          .trim()
                    : null,

            pageUrl:
                typeof definition.pageUrl ===
                    "string" &&
                definition.pageUrl.trim()
                    ? definition.pageUrl
                          .trim()
                    : null,

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

            pageId:
                destination.pageId,

            pageUrl:
                destination.pageUrl,

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

        pageId:
            "faction",

        pageUrl:
            "/factions.php?step=your&type=1#/tab=armoury&sub=donate",

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
    });

    register({
        id:
            DESTINATION_IDS
                .PERSONAL_VAULT,

        name:
            "Personal Vault",

        description:
            "Prepares a deposit into the player's personal vault.",

        pageId:
            null,

        pageUrl:
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
    });

    register({
        id:
            DESTINATION_IDS.BANK,

        name:
            "Bank",

        description:
            "Prepares an investment deposit through Torn's bank.",

        pageId:
            null,

        pageUrl:
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
        "Deposit destination registry loaded"
    );
})();