/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/training/index.js
 *
 * Purpose:
 * Battle-stat gym training calculations and goal planning.
 *
 * Phase 1:
 * - Calculate estimated gym gains
 * - Rank verified-available gyms
 * - Estimate trains and energy to a stat goal
 * - Keep combat modifiers separate from training modifiers
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Training] Namespace unavailable."
        );

        return;
    }

    if (
        !TACTIC.services ||
        typeof TACTIC.services !==
            "object"
    ) {
        TACTIC.services = {};
    }

    const logger =
        TACTIC.services?.logger;

    /*
     * Current community-validated Torn gym gain constants.
     */
    const FORMULA =
        Object.freeze({
            a:
                3.480061091e-7,

            b:
                250,

            c:
                3.091619094e-6,

            d:
                6.82775184551527e-5,

            e:
                -0.0301431777,
        });

    const STAT_KEYS =
        Object.freeze([
            "strength",
            "defense",
            "speed",
            "dexterity",
        ]);

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

    function normalizeStatKey(
        stat
    ) {
        const key =
            String(
                stat || ""
            )
                .trim()
                .toLowerCase();

        return STAT_KEYS.includes(
            key
        )
            ? key
            : null;
    }

    function getSteadfastBonuses(
        factionUpgrades
    ) {
        const bonuses = {
            strength:
                0,

            defense:
                0,

            speed:
                0,

            dexterity:
                0,
        };

        const peaceBranches =
            factionUpgrades
                ?.upgrades
                ?.peace;

        if (
            !Array.isArray(
                peaceBranches
            )
        ) {
            return bonuses;
        }

        const steadfast =
            peaceBranches.find(
                branch =>
                    String(
                        branch?.name || ""
                    ).toLowerCase() ===
                    "steadfast"
            );

        if (
            !steadfast ||
            !Array.isArray(
                steadfast.upgrades
            )
        ) {
            return bonuses;
        }

        for (
            const upgrade of
            steadfast.upgrades
        ) {
            const name =
                String(
                    upgrade?.name || ""
                ).toLowerCase();

            const ability =
                String(
                    upgrade?.ability || ""
                ).toLowerCase();

            const level =
                Number(
                    upgrade?.level
                );

            let statKey =
                null;

            for (
                const candidate of
                STAT_KEYS
            ) {
                if (
                    name.includes(
                        candidate
                    ) ||
                    ability.includes(
                        candidate
                    )
                ) {
                    statKey =
                        candidate;

                    break;
                }
            }

            if (!statKey) {
                continue;
            }

            /*
             * Current Torn Steadfast entries expose the percentage
             * as the upgrade level:
             *
             * Strength training X   -> level 10 -> +10%
             * Defense training XVI  -> level 16 -> +16%
             */
            if (
                Number.isFinite(
                    level
                ) &&
                level >= 0
            ) {
                bonuses[
                    statKey
                ] =
                    level;
            }
        }

        return bonuses;
    }

    function getTrainingModifiers({
        stat,
        factionUpgrades,
    } = {}) {
        const statKey =
            normalizeStatKey(
                stat
            );

        if (!statKey) {
            return {
                stat:
                    null,

                steadfastPercent:
                    0,

                multiplier:
                    1,
            };
        }

        const steadfast =
            getSteadfastBonuses(
                factionUpgrades
            );

        const steadfastPercent =
            Number(
                steadfast[
                    statKey
                ]
            ) || 0;

        return {
            stat:
                statKey,

            steadfastPercent,

            multiplier:
                1 +
                (
                    steadfastPercent /
                    100
                ),
        };
    }

    function calculateGain({
        stat,
        currentStat,
        happiness,
        gymModifier,
        energy,
        trainingMultiplier = 1,
    }) {
        const statKey =
            normalizeStatKey(
                stat
            );

        if (!statKey) {
            return null;
        }

        const statTotal =
            Number(
                currentStat
            );

        const happy =
            Number(
                happiness
            );

        const dots =
            Number(
                gymModifier
            );

        const energyUsed =
            Number(
                energy
            );

        const modifier =
            Number(
                trainingMultiplier
            );

        if (
            !Number.isFinite(
                statTotal
            ) ||
            statTotal < 0 ||
            !Number.isFinite(
                happy
            ) ||
            happy < 0 ||
            !Number.isFinite(
                dots
            ) ||
            dots <= 0 ||
            !Number.isFinite(
                energyUsed
            ) ||
            energyUsed <= 0 ||
            !Number.isFinite(
                modifier
            ) ||
            modifier <= 0
        ) {
            return null;
        }

        const happyAdjusted =
            happy +
            FORMULA.b;

        const inner =
            (
                FORMULA.a *
                    Math.log(
                        happyAdjusted
                    ) +
                FORMULA.c
            ) *
                statTotal +
            FORMULA.d *
                happyAdjusted +
            FORMULA.e;

        const gain =
            modifier *
            dots *
            energyUsed *
            inner;

        return Math.max(
            0,
            gain
        );
    }

    function determineGymAvailability(
        gym,
        activeGym
    ) {
        if (!gym) {
            return {
                status:
                    "unavailable",

                reason:
                    "missing-gym",
            };
        }

        const gymId =
            Number(
                gym.id
            );

        const activeGymId =
            Number(
                activeGym?.id
            );

        if (
            Number.isFinite(
                activeGymId
            ) &&
            gymId ===
                activeGymId
        ) {
            return {
                status:
                    "verified",

                reason:
                    "active-gym",
            };
        }

        /*
         * Torn has 24 standard gyms progressing through George's.
         *
         * Since the player currently has access to Balboas (25),
         * the prerequisite standard-gym chain through George's
         * has necessarily already been unlocked.
         */
        if (
            Number.isFinite(
                activeGymId
            ) &&
            activeGymId >= 25 &&
            gymId >= 1 &&
            gymId <= 24
        ) {
            return {
                status:
                    "verified",

                reason:
                    "standard-progression-complete",
            };
        }

        /*
         * Current Phase 1 cannot prove membership/access to
         * another specialist gym from the API alone.
         */
        if (
            String(
                gym.class || ""
            ).toLowerCase() ===
            "specialist"
        ) {
            return {
                status:
                    "unknown",

                reason:
                    "specialist-membership-unknown",
            };
        }

        return {
            status:
                "unknown",

            reason:
                "unlock-status-unknown",
        };
    }

    function rankGyms({
        stat,
        currentStat,
        happiness,
        gyms,
        activeGym,
        trainingMultiplier = 1,
    }) {
        const statKey =
            normalizeStatKey(
                stat
            );

        if (
            !statKey ||
            !Array.isArray(
                gyms
            )
        ) {
            return [];
        }

        const ranked =
            [];

        for (
            const gym of
            gyms
        ) {
            const availability =
                determineGymAvailability(
                    gym,
                    activeGym
                );

            if (
                availability.status !==
                "verified"
            ) {
                continue;
            }

            const gymModifier =
                Number(
                    gym?.modifiers?.[
                        statKey
                    ]
                ) || 0;

            if (
                gymModifier <=
                0
            ) {
                continue;
            }

            const energyCost =
                Number(
                    gym.energy_cost
                );

            const gainPerTrain =
                calculateGain({
                    stat:
                        statKey,

                    currentStat,

                    happiness,

                    gymModifier,

                    energy:
                        energyCost,

                    trainingMultiplier,
                });

            if (
                !Number.isFinite(
                    gainPerTrain
                ) ||
                gainPerTrain <=
                0
            ) {
                continue;
            }

            ranked.push({
                gymId:
                    gym.id,

                gymName:
                    gym.name,

                gymClass:
                    gym.class,

                energyCost,

                gymModifier,

                gainPerTrain,

                gainPerEnergy:
                    gainPerTrain /
                    energyCost,

                availability:
                    clone(
                        availability
                    ),
            });
        }

        ranked.sort(
            (
                left,
                right
            ) =>
                right.gainPerEnergy -
                left.gainPerEnergy
        );

        return ranked;
    }

    function planGoal({
        stat,
        currentStat,
        targetStat,
        happiness,
        gyms,
        activeGym,
        trainingMultiplier = 1,
    }) {
        const statKey =
            normalizeStatKey(
                stat
            );

        const current =
            Number(
                currentStat
            );

        const target =
            Number(
                targetStat
            );

        if (
            !statKey ||
            !Number.isFinite(
                current
            ) ||
            !Number.isFinite(
                target
            ) ||
            target <=
                current
        ) {
            return null;
        }

        const rankings =
            rankGyms({
                stat:
                    statKey,

                currentStat:
                    current,

                happiness,

                gyms,

                activeGym,

                trainingMultiplier,
            });

        const best =
            rankings[0] ||
            null;

        if (!best) {
            return {
                stat:
                    statKey,

                current,

                target,

                remaining:
                    target -
                    current,

                recommendation:
                    null,

                rankings,
            };
        }

        const remaining =
            target -
            current;

        let simulatedStat =
            current;

        let estimatedTrains =
            0;

        let totalGain =
            0;

        const maxSimulatedTrains =
            1000000;

        while (
            simulatedStat <
                target &&
            estimatedTrains <
                maxSimulatedTrains
        ) {
            const gain =
                calculateGain({
                    stat:
                        statKey,

                    currentStat:
                        simulatedStat,

                    happiness,

                    gymModifier:
                        best.gymModifier,

                    energy:
                        best.energyCost,

                    trainingMultiplier,
                });

            if (
                !Number.isFinite(
                    gain
                ) ||
                gain <= 0
            ) {
                break;
            }

            simulatedStat +=
                gain;

            totalGain +=
                gain;

            estimatedTrains +=
                1;
        }

        const estimatedEnergy =
            estimatedTrains *
            best.energyCost;

        const finalGainPerTrain =
            calculateGain({
                stat:
                    statKey,

                currentStat:
                    simulatedStat,

                happiness,

                gymModifier:
                    best.gymModifier,

                energy:
                    best.energyCost,

                trainingMultiplier,
            });

        const averageGainPerTrain =
            estimatedTrains > 0
                ? totalGain /
                estimatedTrains
                : 0;
        
        const simulationComplete =
            simulatedStat >=
            target;

        return {
            stat:
                statKey,

            current,

            target,

            remaining,

            recommendation:
                best,

            estimatedTrains,

            estimatedEnergy,

            startingGainPerTrain:
                best.gainPerTrain,

            averageGainPerTrain,

            finalGainPerTrain,

            projectedFinalStat:
                simulatedStat,

            simulationComplete,

            rankings,
        };
    }

    function inspect() {
        return {
            formula:
                clone(
                    FORMULA
                ),

            statKeys: [
                ...STAT_KEYS,
            ],
        };
    }

    TACTIC.services.training =
        Object.freeze({
            calculateGain,
            determineGymAvailability,
            getSteadfastBonuses,
            getTrainingModifiers,
            rankGyms,
            planGoal,
            inspect,
        });

    logger?.info(
        "Training service loaded",
        {
            formula:
                "gym-gain-v1",
        }
    );
})();