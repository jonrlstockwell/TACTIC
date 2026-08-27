/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * repositories/stats/index.js
 *
 * Purpose:
 * Central source of battle-stat and gym-training data.
 *
 * Phase 1:
 * - Store Torn API key locally
 * - Load battle stats
 * - Load current gym
 * - Load energy / happiness
 * - Load Torn gym catalog
 * - Persist stat goals
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Stats Repository] Namespace unavailable."
        );

        return;
    }

    if (
        !TACTIC.repositories ||
        typeof TACTIC.repositories !==
            "object"
    ) {
        TACTIC.repositories = {};
    }

    const storage =
        TACTIC.services?.storage;

    const logger =
        TACTIC.services?.logger;

    if (!storage) {
        console.error(
            "[TACTIC Stats Repository] Storage service unavailable."
        );

        return;
    }

    const API_KEY_STORAGE =
        "stats:torn-api-key";

    const GOALS_STORAGE =
        "stats:goals";

    const DATA_STORAGE =
        "stats:last-data";

    const DEFAULT_GOALS =
        Object.freeze({
            strength:
                0,

            defense:
                0,

            speed:
                0,

            dexterity:
                0,
        });

    const state = {
        loading:
            false,

        loadedAt:
            null,

        lastError:
            null,

        battlestats:
            null,

        bars:
            null,

        activeGym:
            null,

        gyms:
            null,

        factionUpgrades:
            null,

        userPerks:
            null,

        userCalendar:
            null,

        tornCalendar:
            null,
    };

    function clone(
        value
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            return value;
        }

        try {
            return structuredClone(
                value
            );
        } catch {
            return JSON.parse(
                JSON.stringify(
                    value
                )
            );
        }
    }

    function getApiKey() {
        return String(
            storage.get(
                API_KEY_STORAGE,
                ""
            ) || ""
        ).trim();
    }

    function setApiKey(
        key
    ) {
        const normalized =
            String(
                key || ""
            ).trim();

        if (!normalized) {
            storage.remove(
                API_KEY_STORAGE
            );

            return false;
        }

        storage.set(
            API_KEY_STORAGE,
            normalized
        );

        return true;
    }

    function clearApiKey() {
        storage.remove(
            API_KEY_STORAGE
        );
    }

    function getGoals() {
        const saved =
            storage.get(
                GOALS_STORAGE,
                null
            );

        return {
            ...DEFAULT_GOALS,
            ...(
                saved &&
                typeof saved ===
                    "object"
                    ? saved
                    : {}
            ),
        };
    }

    function setGoals(
        goals
    ) {
        const normalized = {
            strength:
                Math.max(
                    0,
                    Number(
                        goals?.strength
                    ) || 0
                ),

            defense:
                Math.max(
                    0,
                    Number(
                        goals?.defense
                    ) || 0
                ),

            speed:
                Math.max(
                    0,
                    Number(
                        goals?.speed
                    ) || 0
                ),

            dexterity:
                Math.max(
                    0,
                    Number(
                        goals?.dexterity
                    ) || 0
                ),
        };

        storage.set(
            GOALS_STORAGE,
            normalized
        );

        return clone(
            normalized
        );
    }

    async function apiRequest(
        path
    ) {
        const key =
            getApiKey();

        if (!key) {
            throw new Error(
                "No Torn API key configured."
            );
        }

        const response =
            await fetch(
                `https://api.torn.com${path}`,
                {
                    headers: {
                        Authorization:
                            `ApiKey ${key}`,
                    },
                }
            );

        if (!response.ok) {
            throw new Error(
                `Torn API request failed: HTTP ${response.status}`
            );
        }

        const payload =
            await response.json();

        if (payload?.error) {
            throw new Error(
                payload.error
                    ?.error ||
                payload.error
                    ?.message ||
                "Torn API returned an error."
            );
        }

        return payload;
    }

    function normalizeBattleStats(
        raw
    ) {
        const stats =
            raw?.battlestats ||
            {};

        function normalizeStat(
            key
        ) {
            const entry =
                stats?.[key] ||
                {};

            const value =
                Number(
                    entry.value
                ) || 0;

            const modifier =
                Number(
                    entry.modifier
                ) || 0;

            /*
             * Keep raw API values intact.
             *
             * We are not yet deciding whether modifier represents
             * a multiplier, percentage, or another effective-stat
             * representation. Phase 2 will validate that explicitly.
             */
            return {
                value,
                modifier,

                raw:
                    clone(
                        entry
                    ),
            };
        }

        return {
            strength:
                normalizeStat(
                    "strength"
                ),

            defense:
                normalizeStat(
                    "defense"
                ),

            speed:
                normalizeStat(
                    "speed"
                ),

            dexterity:
                normalizeStat(
                    "dexterity"
                ),
        };
    }

    async function loadFactionUpgrades() {
        try {
            return await apiRequest(
                "/v2/faction/upgrades"
            );
        } catch (error) {
            /*
             * Faction upgrade information can require faction API
             * permissions depending on the player's role/key access.
             *
             * Do not fail the entire Stats refresh if it is unavailable.
             */
            logger?.warn(
                "Faction upgrades unavailable",
                {
                    message:
                        error?.message ||
                        String(error),
                }
            );

            return null;
        }
    }

    async function loadUserPerks() {
        try {
            return await apiRequest(
                "/v2/user/perks"
            );
        } catch (error) {
            logger?.warn(
                "User perks unavailable",
                {
                    message:
                        error?.message ||
                        String(error),
                }
            );

            return null;
        }
    }

    async function loadUserCalendar() {
        try {
            return await apiRequest(
                "/v2/user/calendar"
            );
        } catch (error) {
            logger?.warn(
                "User calendar unavailable",
                {
                    message:
                        error?.message ||
                        String(error),
                }
            );

            return null;
        }
    }

    async function loadTornCalendar() {
        try {
            return await apiRequest(
                "/v2/torn/calendar"
            );
        } catch (error) {
            logger?.warn(
                "Torn calendar unavailable",
                {
                    message:
                        error?.message ||
                        String(error),
                }
            );

            return null;
        }
    }

    async function refresh() {
        if (state.loading) {
            return inspect();
        }

        state.loading =
            true;

        state.lastError =
            null;

        try {
            /*
             * User endpoint:
             * - battlestats
             * - bars
             * - gym
             *
             * The current API v2 returns battlestats as structured
             * entries and exposes current gym information separately.
             */
            const [
                userResponse,
                gymResponse,
                factionUpgradesResponse,
                userPerksResponse,
                userCalendarResponse,
                tornCalendarResponse,
            ] =
                await Promise.all([
                    apiRequest(
                        "/v2/user?selections=bars,gym,battlestats"
                    ),

                    apiRequest(
                        "/v2/torn/gyms"
                    ),

                    loadFactionUpgrades(),

                    loadUserPerks(),

                    loadUserCalendar(),

                    loadTornCalendar(),
                    ]);

            console.group(
                "[TACTIC STATS] Training Data Audit"
            );

            console.log(
                "RAW USER RESPONSE:",
                userResponse
            );

            console.log(
                "RAW GYM RESPONSE:",
                gymResponse
            );

            console.log(
                "RAW BATTLE STATS:",
                userResponse?.battlestats
            );

            console.log(
                "RAW ACTIVE GYM:",
                userResponse?.active_gym ??
                userResponse?.gym ??
                null
            );

            console.log(
                "RAW BARS:",
                userResponse?.bars
            );

            console.log(
                "GYM CATALOG:",
                gymResponse?.gyms
            );

            console.log(
                "RAW USER CALENDAR:",
                userCalendarResponse
            );

            console.log(
                "RAW TORN CALENDAR:",
                tornCalendarResponse
            );

            console.groupEnd();

            state.battlestats =
                normalizeBattleStats(
                    userResponse
                );

            state.bars =
                clone(
                    userResponse
                        ?.bars ||
                    null
                );

            state.activeGym =
                userResponse
                    ?.active_gym ??
                userResponse
                    ?.gym ??
                null;

            state.gyms =
                clone(
                    gymResponse
                        ?.gyms ||
                    {}
                );

            state.factionUpgrades =
                clone(
                    factionUpgradesResponse
                );

            state.userPerks =
                clone(
                    userPerksResponse
                );

            state.userCalendar =
                clone(
                    userCalendarResponse
                );

            state.tornCalendar =
                clone(
                    tornCalendarResponse
                );

            state.loadedAt =
                Date.now();

            storage.set(
                DATA_STORAGE,
                {
                    battlestats:
                        state
                            .battlestats,

                    bars:
                        state.bars,

                    activeGym:
                        state
                            .activeGym,

                    gyms:
                        state.gyms,

                    factionUpgrades:
                        state
                            .factionUpgrades,

                    userPerks:
                        state
                            .userPerks,

                    userCalendar:
                        state
                            .userCalendar,

                    tornCalendar:
                        state
                            .tornCalendar,

                    loadedAt:
                        state
                            .loadedAt,
                }
            );

            logger?.info(
                "Stats Repository refreshed",
                {
                    activeGym:
                        state
                            .activeGym,

                    loadedAt:
                        state
                            .loadedAt,
                }
            );

            return inspect();
        } catch (
            error
        ) {
            state.lastError = {
                message:
                    error?.message ||
                    String(error),

                timestamp:
                    Date.now(),
            };

            logger?.warn(
                "Stats Repository refresh failed",
                {
                    error,
                }
            );

            throw error;
        } finally {
            state.loading =
                false;
        }
    }

    function restoreCachedData() {
        const cached =
            storage.get(
                DATA_STORAGE,
                null
            );

        if (
            !cached ||
            typeof cached !==
                "object"
        ) {
            return;
        }

        state.battlestats =
            clone(
                cached.battlestats
            );

        state.bars =
            clone(
                cached.bars
            );

        state.activeGym =
            cached.activeGym ??
            null;

        state.gyms =
            clone(
                cached.gyms
            );

        state.factionUpgrades =
            clone(
                cached.factionUpgrades
            );

        state.userPerks =
            clone(
                cached.userPerks
            );

        state.userCalendar =
            clone(
                cached.userCalendar
            );

        state.tornCalendar =
            clone(
                cached.tornCalendar
            );

        state.loadedAt =
            Number.isFinite(
                cached.loadedAt
            )
                ? cached.loadedAt
                : null;
    }

    function inspect() {
        return {
            loading:
                state.loading,

            loadedAt:
                state.loadedAt,

            apiKeyConfigured:
                Boolean(
                    getApiKey()
                ),

            battlestats:
                clone(
                    state
                        .battlestats
                ),

            bars:
                clone(
                    state.bars
                ),

            activeGym:
                clone(
                    state.activeGym
                ),

            gyms:
                clone(
                    state.gyms
                ),

            factionUpgrades:
                clone(
                    state
                        .factionUpgrades
                ),

            userPerks:
                clone(
                    state
                        .userPerks
                ),

            userCalendar:
                clone(
                    state
                        .userCalendar
                ),

            tornCalendar:
                clone(
                    state
                        .tornCalendar
                ),

            goals:
                getGoals(),

            lastError:
                clone(
                    state
                        .lastError
                ),
        };
    }

    restoreCachedData();

    TACTIC.repositories.stats =
        Object.freeze({
            getApiKey,
            setApiKey,
            clearApiKey,

            getGoals,
            setGoals,

            refresh,
            inspect,
        });

    logger?.info(
        "Stats Repository loaded"
    );
})();