/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/stats/index.js
 *
 * Purpose:
 * Battle Stats overview and training-goal interface.
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (
        !TACTIC ||
        typeof TACTIC.registerModule !==
            "function"
    ) {
        console.error(
            "[TACTIC Stats] Module framework unavailable."
        );

        return;
    }

    const MODULE_ID =
        "stats";

    const MODULE_VERSION =
        "0.1.0";

    const MODULE_ORDER =
        300;

    const LIVE_BAR_TICK_MS =
        1000;

    const STATS_FRESH_MS =
        5 * 1000;

    const SUSTAINABLE_BOOSTER_HOURS_PER_DAY =
        24;

    const STATS_API_REQUIREMENTS =
        Object.freeze({
            accessLevel:
                "Limited",

            selections:
                Object.freeze({
                    user:
                        Object.freeze([
                            "bars",
                            "gym",
                            "battlestats",
                            "perks",
                            "calendar",
                        ]),

                    torn:
                        Object.freeze([
                            "gyms",
                            "calendar",
                        ]),

                    faction:
                        Object.freeze([
                            "upgrades",
                        ]),
                }),

            optional:
                Object.freeze({
                    faction:
                        Object.freeze([
                            "upgrades",
                        ]),
                }),
        });

    function formatApiRequirementSummary(
        requirements
    ) {
        const selections =
            requirements
                ?.selections;

        if (
            !selections ||
            typeof selections !==
                "object"
        ) {
            return "No API selections registered.";
        }

        const result = [];

        for (
            const [
                section,
                sectionSelections,
            ] of
            Object.entries(
                selections
            )
        ) {
            if (
                !Array.isArray(
                    sectionSelections
                )
            ) {
                continue;
            }

            for (
                const selection of
                sectionSelections
            ) {
                result.push(
                    `${section}/${selection}`
                );
            }
        }

        return result.length > 0
            ? result.join(", ")
            : "No API selections registered.";
    }

    let liveBarTimer =
        null;

    let statsContainer =
        null;

    let statsRefreshInFlight =
        false;
    
    let livePageSnapshot =
        null;

    const repository =
        TACTIC.repositories?.stats;

    const logger =
        TACTIC.services?.logger;

    const training =
        TACTIC.services?.training;

    const storage =
        TACTIC.services?.storage;

    const PLANNER_SETTINGS_STORAGE_KEY =
        "stats:training-planner-settings";

    const DEFAULT_PLANNER_SETTINGS =
        Object.freeze({
            dailyRefill:
                true,

            xanaxEnabled:
                false,

            xanaxPerDay:
                3,

            energyDrinksEnabled:
                false,

            energyDrinksPerDay:
                0,

            baseEnergyPerDrink:
                30,

            fhcEnabled:
                false,

            fhcPerDay:
                0,
        });

    if (
        !repository ||
        !training ||
        !storage
    ) {
        console.error(
            "[TACTIC Stats] Stats Repository, Training service, or Storage service unavailable."
        );

        return;
    }

    function formatNumber(
        value
    ) {
        if (
            !Number.isFinite(
                Number(value)
            )
        ) {
            return "—";
        }

        return Math.round(
            Number(value)
        ).toLocaleString(
            "en-US"
        );
    }

    function formatBattleStat(
        value
    ) {
        const number =
            Number(value);

        if (
            !Number.isFinite(
                number
            )
        ) {
            return "—";
        }

        const absolute =
            Math.abs(
                number
            );

        const units = [
            {
                threshold:
                    1_000_000_000_000_000,
                divisor:
                    1_000_000_000_000_000,
                suffix:
                    "Q",
            },
            {
                threshold:
                    1_000_000_000_000,
                divisor:
                    1_000_000_000_000,
                suffix:
                    "T",
            },
            {
                threshold:
                    1_000_000_000,
                divisor:
                    1_000_000_000,
                suffix:
                    "B",
            },
        ];

        for (
            const unit of
            units
        ) {
            if (
                absolute >=
                unit.threshold
            ) {
                return (
                    number /
                    unit.divisor
                )
                    .toFixed(3)
                    .replace(
                        /\.?0+$/,
                        ""
                    ) +
                    unit.suffix;
            }
        }

        return Math.round(
            number
        ).toLocaleString(
            "en-US"
        );
    }

    function formatDuration(
        seconds
    ) {
        const totalSeconds =
            Math.max(
                0,
                Math.round(
                    Number(seconds) || 0
                )
            );

        const days =
            Math.floor(
                totalSeconds /
                    86400
            );

        const hours =
            Math.floor(
                (
                    totalSeconds %
                    86400
                ) /
                    3600
            );

        const minutes =
            Math.floor(
                (
                    totalSeconds %
                    3600
                ) /
                    60
            );

        if (days > 0) {
            return `${days}d ${hours}h`;
        }

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }

        return `${minutes}m`;
    }

    function formatActiveGym(
        activeGym
    ) {
        if (
            activeGym === null ||
            activeGym === undefined
        ) {
            return "Unknown";
        }

        if (
            typeof activeGym ===
            "string" ||
            typeof activeGym ===
            "number"
        ) {
            return String(
                activeGym
            );
        }

        if (
            typeof activeGym ===
            "object"
        ) {
            return (
                activeGym.name ||
                activeGym.title ||
                activeGym.gym_name ||
                activeGym.id ||
                "Unknown"
            );
        }

        return "Unknown";
    }

    function formatCompactNumber(
        value
    ) {
        const number =
            Number(
                value
            );

        if (
            !Number.isFinite(
                number
            )
        ) {
            return "—";
        }

        return new Intl
            .NumberFormat(
                "en-US",
                {
                    notation:
                        "compact",

                    maximumFractionDigits:
                        2,
                }
            )
            .format(
                number
            );
    }

    function createElement(
        tag,
        options = {}
    ) {
        const element =
            document.createElement(
                tag
            );

        if (
            options.text !==
            undefined
        ) {
            element.textContent =
                options.text;
        }

        if (
            options.className
        ) {
            element.className =
                options.className;
        }

        if (
            options.styles
        ) {
            Object.assign(
                element.style,
                options.styles
            );
        }

        return element;
    }

    function createButton(
        text
    ) {
        return createElement(
            "button",
            {
                text,

                styles: {
                    cursor:
                        "pointer",

                    padding:
                        "7px 10px",

                    borderRadius:
                        "5px",

                    border:
                        "1px solid rgba(255,255,255,.18)",

                    background:
                        "rgba(255,255,255,.08)",

                    color:
                        "inherit",

                    width:
                        "100%",
                },
            }
        );
    }

    function normalizePlannerSettings(
        value
    ) {
        const source =
            value &&
            typeof value ===
                "object"
                ? value
                : {};

        return {
            dailyRefill:
                source.dailyRefill !==
                    undefined
                    ? Boolean(
                        source.dailyRefill
                    )
                    : DEFAULT_PLANNER_SETTINGS
                        .dailyRefill,

            xanaxEnabled:
                Boolean(
                    source.xanaxEnabled
                ),

            xanaxPerDay:
                Math.min(
                    3,
                    Math.max(
                        1,
                        Math.round(
                            Number(
                                source.xanaxPerDay
                            ) ||
                            DEFAULT_PLANNER_SETTINGS
                                .xanaxPerDay
                        )
                    )
                ),

            energyDrinksEnabled:
                Boolean(
                    source
                        .energyDrinksEnabled
                ),

            energyDrinksPerDay:
                Math.min(
                    12,
                    Math.max(
                        0,
                        Math.round(
                            Number(
                                source
                                    .energyDrinksPerDay
                            ) || 0
                        )
                    )
                ),

            baseEnergyPerDrink:
                Math.max(
                    5,
                    Math.round(
                        Number(
                            source
                                .baseEnergyPerDrink ??
                            source
                                .energyPerDrink
                        ) ||
                        DEFAULT_PLANNER_SETTINGS
                            .baseEnergyPerDrink
                    )
                ),

            fhcEnabled:
                Boolean(
                    source.fhcEnabled
                ),

            fhcPerDay:
                Math.min(
                    4,
                    Math.max(
                        0,
                        Math.round(
                            Number(
                                source.fhcPerDay
                            ) || 0
                        )
                    )
                ),
        };
    }

    function getPlannerSettings() {
        return normalizePlannerSettings(
            storage.get(
                PLANNER_SETTINGS_STORAGE_KEY,
                DEFAULT_PLANNER_SETTINGS
            )
        );
    }

    function savePlannerSettings(
        settings
    ) {
        const normalized =
            normalizePlannerSettings(
                settings
            );

        storage.set(
            PLANNER_SETTINGS_STORAGE_KEY,
            normalized
        );

        return normalized;
    }

    function stylePlannerField(
        element
    ) {
        Object.assign(
            element.style,
            {
                width:
                    "100%",

                boxSizing:
                    "border-box",

                padding:
                    "6px 8px",

                borderRadius:
                    "5px",

                border:
                    "1px solid rgba(255,255,255,.15)",

                background:
                    "rgba(0,0,0,.2)",

                color:
                    "#fff",

                fontSize:
                    "12px",

                textAlign:
                    "center",
            }
        );

        return element;
    }

    function createPlannerToggleRow(
        labelText,
        checked
    ) {
        const row =
            createElement(
                "label",
                {
                    styles: {
                        display:
                            "flex",

                        alignItems:
                            "center",

                        justifyContent:
                            "space-between",

                        gap:
                            "10px",

                        cursor:
                            "pointer",

                        fontSize:
                            "12px",
                    },
                }
            );

        const label =
            createElement(
                "span",
                {
                    text:
                        labelText,
                }
            );

        const checkbox =
            document.createElement(
                "input"
            );

        checkbox.type =
            "checkbox";

        checkbox.checked =
            checked;

        checkbox.style.width =
            "16px";

        checkbox.style.height =
            "16px";

        row.append(
            label,
            checkbox
        );

        return {
            row,
            checkbox,
        };
    }

    function createPlannerSettingsPanel() {
        let settings =
            getPlannerSettings();

        const panel =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "12px",

                        padding:
                            "12px",

                        border:
                            "1px solid rgba(255,255,255,.12)",

                        borderRadius:
                            "7px",

                        background:
                            "rgba(255,255,255,.025)",
                    },
                }
            );

        const heading =
            createElement(
                "div",
                {
                    text:
                        "TRAINING PLANNER SETTINGS",

                    styles: {
                        textAlign:
                            "center",

                        fontSize:
                            "11px",

                        fontWeight:
                            "700",

                        letterSpacing:
                            ".07em",

                        opacity:
                            ".7",
                    },
                }
            );

        panel.appendChild(
            heading
        );

        /*
         * DAILY REFILL
         */

        const dailyRefill =
            createPlannerToggleRow(
                "Include daily energy refill",
                settings.dailyRefill
            );

        dailyRefill.checkbox.addEventListener(
            "change",
            () => {
                settings.dailyRefill =
                    dailyRefill.checkbox.checked;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        panel.appendChild(
            dailyRefill.row
        );

        /*
         * XANAX
         */

        const xanaxSection =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "7px",

                        paddingTop:
                            "10px",

                        borderTop:
                            "1px solid rgba(255,255,255,.08)",
                    },
                }
            );

        const xanaxToggle =
            createPlannerToggleRow(
                "Include Xanax",
                settings.xanaxEnabled
            );

        const xanaxControl =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "1fr 90px",

                        gap:
                            "8px",

                        alignItems:
                            "center",
                    },
                }
            );

        xanaxControl.appendChild(
            createElement(
                "div",
                {
                    text:
                        "Xanax per day",

                    styles: {
                        fontSize:
                            "11px",

                        opacity:
                            ".7",
                    },
                }
            )
        );

        const xanaxSelect =
            stylePlannerField(
                document.createElement(
                    "select"
                )
            );

        xanaxSelect.style.backgroundColor =
            "#1b1b1b";

        xanaxSelect.style.color =
            "#fff";

        for (
            const amount of
            [1, 2, 3]
        ) {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                String(amount);

            option.textContent =
                String(amount);

            option.style.backgroundColor =
                "#1b1b1b";

            option.style.color =
                "#fff";

            xanaxSelect.appendChild(
                option
            );
        }

        xanaxSelect.value =
            String(
                settings.xanaxPerDay
            );

        xanaxSelect.disabled =
            !settings.xanaxEnabled;

        xanaxToggle.checkbox.addEventListener(
            "change",
            () => {
                settings.xanaxEnabled =
                    xanaxToggle.checkbox.checked;

                xanaxSelect.disabled =
                    !settings.xanaxEnabled;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        xanaxSelect.addEventListener(
            "change",
            () => {
                settings.xanaxPerDay =
                    Number(
                        xanaxSelect.value
                    );

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        xanaxControl.appendChild(
            xanaxSelect
        );

        xanaxSection.append(
            xanaxToggle.row,
            xanaxControl
        );

        panel.appendChild(
            xanaxSection
        );

        /*
         * ENERGY DRINKS
         */

        const drinksSection =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "7px",

                        paddingTop:
                            "10px",

                        borderTop:
                            "1px solid rgba(255,255,255,.08)",
                    },
                }
            );

        const drinksToggle =
            createPlannerToggleRow(
                "Include energy drinks",
                settings.energyDrinksEnabled
            );

        const drinksGrid =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "1fr 90px",

                        gap:
                            "8px",

                        alignItems:
                            "center",
                    },
                }
            );

        const drinksQty =
            stylePlannerField(
                document.createElement(
                    "input"
                )
            );

        drinksQty.type =
            "number";

        drinksQty.min =
            "0";

        drinksQty.max =
            "12";

        drinksQty.step =
            "1";

        drinksQty.value =
            String(
                settings.energyDrinksPerDay
            );

        const drinkEnergy =
            stylePlannerField(
                document.createElement(
                    "select"
                )
            );

        drinkEnergy.style.backgroundColor =
            "#1b1b1b";

        drinkEnergy.style.color =
            "#fff";

        for (
            const amount of
            [
                5,
                10,
                15,
                20,
                25,
                30,
            ]
        ) {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                String(amount);

            option.textContent =
                `${amount} E`;

            option.style.backgroundColor =
                "#1b1b1b";

            option.style.color =
                "#fff";

            drinkEnergy.appendChild(
                option
            );
        }

        drinkEnergy.value =
            String(
                settings
                    .baseEnergyPerDrink
            );

        drinksQty.disabled =
            !settings.energyDrinksEnabled;

        drinkEnergy.disabled =
            !settings.energyDrinksEnabled;

        drinksGrid.append(
            createElement(
                "div",
                {
                    text:
                        "Max drinks / day",

                    styles: {
                        fontSize:
                            "11px",

                        opacity:
                            ".7",
                    },
                }
            ),
            drinksQty,

            createElement(
                "div",
                {
                    text:
                        "Base E / drink",

                    styles: {
                        fontSize:
                            "11px",

                        opacity:
                            ".7",
                    },
                }
            ),
            drinkEnergy
        );

        drinksToggle.checkbox.addEventListener(
            "change",
            () => {
                settings.energyDrinksEnabled =
                    drinksToggle.checkbox.checked;

                drinksQty.disabled =
                    !settings.energyDrinksEnabled;

                drinkEnergy.disabled =
                    !settings.energyDrinksEnabled;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        drinksQty.addEventListener(
            "input",
            () => {
                const value =
                    Math.min(
                        12,
                        Math.max(
                            0,
                            Math.round(
                                Number(
                                    drinksQty.value
                                ) || 0
                            )
                        )
                    );

                drinksQty.value =
                    String(value);

                settings.energyDrinksPerDay =
                    value;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        drinkEnergy.addEventListener(
            "change",
            () => {
                settings.baseEnergyPerDrink =
                    Number(
                        drinkEnergy.value
                    ) || 30;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        const statsData =
            repository.inspect();

        const energyDrinkEffect =
            getEnergyDrinkEffect({
                baseEnergy:
                    settings
                        .baseEnergyPerDrink,

                userPerks:
                    statsData?.userPerks,

                tornCalendar:
                    statsData?.tornCalendar,

                userCalendar:
                    statsData?.userCalendar,
            });

        const effectiveEnergyPerDrink =
            energyDrinkEffect
                .effectiveEnergy;

        drinksSection.append(
            drinksToggle.row,
            drinksGrid
        );

        const drinkEffectSummary =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "2px",

                        fontSize:
                            "9px",

                        opacity:
                            ".6",

                        textAlign:
                            "center",

                        lineHeight:
                            "1.35",
                    },
                }
            );

        drinkEffectSummary.appendChild(
            createElement(
                "div",
                {
                    text:
                        `Effective: ${energyDrinkEffect.effectiveEnergy} E / can`,
                }
            )
        );

        for (
            const modifier of
            energyDrinkEffect
                .modifiers
        ) {
            if (
                !modifier?.display
            ) {
                continue;
            }

            drinkEffectSummary.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            modifier
                                .display,
                    }
                )
            );
        }

        if (
            energyDrinkEffect
                .multiplier >
            1
        ) {
            drinkEffectSummary.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            `Total multiplier: ×${energyDrinkEffect.multiplier.toFixed(2)}`,

                        styles: {
                            marginTop:
                                "1px",
                        },
                    }
                )
            );
        }

        drinksSection.appendChild(
            drinkEffectSummary
        );

        panel.appendChild(
            drinksSection
        );

        /*
         * FHC
         */

        const fhcSection =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "7px",

                        paddingTop:
                            "10px",

                        borderTop:
                            "1px solid rgba(255,255,255,.08)",
                    },
                }
            );

        const fhcToggle =
            createPlannerToggleRow(
                "Include FHC",
                settings.fhcEnabled
            );

        const fhcControl =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "1fr 90px",

                        gap:
                            "8px",

                        alignItems:
                            "center",
                    },
                }
            );

        fhcControl.appendChild(
            createElement(
                "div",
                {
                    text:
                        "Max FHC / day",

                    styles: {
                        fontSize:
                            "11px",

                        opacity:
                            ".7",
                    },
                }
            )
        );

        const fhcQty =
            stylePlannerField(
                document.createElement(
                    "input"
                )
            );

        fhcQty.type =
            "number";

        fhcQty.min =
            "0";

        fhcQty.max =
            "4";

        fhcQty.step =
            "1";

        fhcQty.value =
            String(
                settings.fhcPerDay
            );

        fhcQty.disabled =
            !settings.fhcEnabled;

        fhcToggle.checkbox.addEventListener(
            "change",
            () => {
                settings.fhcEnabled =
                    fhcToggle.checkbox.checked;

                fhcQty.disabled =
                    !settings.fhcEnabled;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        fhcQty.addEventListener(
            "input",
            () => {
                const value =
                    Math.min(
                        4,
                        Math.max(
                            0,
                            Math.round(
                                Number(
                                    fhcQty.value
                                ) || 0
                            )
                        )
                    );

                fhcQty.value =
                    String(value);

                settings.fhcPerDay =
                    value;

                settings =
                    savePlannerSettings(
                        settings
                    );
            }
        );

        fhcControl.appendChild(
            fhcQty
        );

        fhcSection.append(
            fhcToggle.row,
            fhcControl
        );

        panel.appendChild(
            fhcSection
        );

        const maximumBoosterCooldownHours =
            getMaximumBoosterCooldownHours(
                statsData?.userPerks
            );

        const sustainableBoosterHoursPerDay =
            SUSTAINABLE_BOOSTER_HOURS_PER_DAY;

        const maximumEnergy =
            Number(
                statsData
                    ?.bars
                    ?.energy
                    ?.maximum
            ) || 0;

        const boosterHoursRequested =
            (
                settings.energyDrinksEnabled
                    ? settings.energyDrinksPerDay *
                        2
                    : 0
            ) +
            (
                settings.fhcEnabled
                    ? settings.fhcPerDay *
                        6
                    : 0
            );

        const requestedDrinks =
            settings.energyDrinksEnabled
                ? settings.energyDrinksPerDay
                : 0;

        const requestedFhc =
            settings.fhcEnabled
                ? settings.fhcPerDay
                : 0;

        const recommendedBoosterPlan =
            optimizeBoosterMix({
                requestedDrinks,

                requestedFhc,

                energyPerDrink:
                    effectiveEnergyPerDrink,

                maximumEnergy,

                cooldownLimit:
                    sustainableBoosterHoursPerDay,
            });

        /*
         * Always show the user's booster cooldown information.
         */
        const boosterSummary =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "3px",

                        padding:
                            "8px",

                        border:
                            "1px solid rgba(255,255,255,.08)",

                        borderRadius:
                            "5px",

                        fontSize:
                            "10px",

                        textAlign:
                            "center",

                        opacity:
                            ".7",
                    },
                }
            );

        boosterSummary.append(
            createElement(
                "div",
                {
                    text:
                        `Personal maximum: ${maximumBoosterCooldownHours}h`,
                }
            ),

            createElement(
                "div",
                {
                    text:
                        `Sustainable daily use: ${sustainableBoosterHoursPerDay}h`,
                }
            ),

            createElement(
                "div",
                {
                    text:
                        `Selected cooldown: ${boosterHoursRequested}h / day`,

                    styles: {
                        fontWeight:
                            "600",
                    },
                }
            )
        );

        panel.appendChild(
            boosterSummary
        );

        const recommendationPanel =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "3px",

                        padding:
                            "8px",

                        border:
                            "1px solid rgba(255,255,255,.08)",

                        borderRadius:
                            "5px",

                        textAlign:
                            "center",
                    },
                }
            );

        recommendationPanel.appendChild(
            createElement(
                "div",
                {
                    text:
                        "TACTIC RECOMMENDS",

                    styles: {
                        fontSize:
                            "10px",

                        fontWeight:
                            "700",

                        letterSpacing:
                            ".07em",

                        opacity:
                            ".7",

                        marginBottom:
                            "2px",
                    },
                }
            )
        );

        recommendationPanel.appendChild(
            createElement(
                "div",
                {
                    text:
                        `${recommendedBoosterPlan.fhc} FHC / day`,

                    styles: {
                        fontSize:
                            "11px",

                        fontWeight:
                            "600",
                    },
                }
            )
        );

        recommendationPanel.appendChild(
            createElement(
                "div",
                {
                    text:
                        `${recommendedBoosterPlan.drinks} Energy Drinks / day`,

                    styles: {
                        fontSize:
                            "11px",

                        fontWeight:
                            "600",
                    },
                }
            )
        );

        recommendationPanel.appendChild(
            createElement(
                "div",
                {
                    text:
                        `${formatNumber(recommendedBoosterPlan.energyPerDay)} booster Energy / day`,

                    styles: {
                        marginTop:
                            "3px",

                        fontSize:
                            "10px",

                        opacity:
                            ".75",
                    },
                }
            )
        );

        recommendationPanel.appendChild(
            createElement(
                "div",
                {
                    text:
                        `${recommendedBoosterPlan.cooldownHours}h booster cooldown / day`,

                    styles: {
                        fontSize:
                            "10px",

                        opacity:
                            ".75",
                    },
                }
            )
        );

        if (
            requestedDrinks > 0 &&
            requestedFhc > 0
        ) {
            recommendationPanel.appendChild(
                createElement(
                    "div",
                    {
                        styles: {
                            height:
                                "1px",

                            background:
                                "rgba(255,255,255,.08)",

                            margin:
                                "4px 0",
                        },
                    }
                )
            );

            recommendationPanel.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            `FHC efficiency: ${recommendedBoosterPlan.fhcEfficiency.toFixed(1)} E / cooldown hr`,

                        styles: {
                            fontSize:
                                "9px",

                            opacity:
                                ".6",
                        },
                    }
                )
            );

            recommendationPanel.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            `Can efficiency: ${recommendedBoosterPlan.drinkEfficiency.toFixed(1)} E / cooldown hr`,

                        styles: {
                            fontSize:
                                "9px",

                            opacity:
                                ".6",
                        },
                    }
                )
            );
        }

        panel.appendChild(
            recommendationPanel
        );

        /*
         * Warn only when the selected daily plan exceeds
         * sustainable daily booster cooldown.
         */
        if (
            boosterHoursRequested >
            sustainableBoosterHoursPerDay
        ) {
            const boosterHoursOver =
                boosterHoursRequested -
                sustainableBoosterHoursPerDay;

            panel.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            `Your selected plan exceeds your sustainable booster cooldown by ${boosterHoursOver} hours per day.`,

                        styles: {
                            fontSize:
                                "10px",

                            lineHeight:
                                "1.35",

                            textAlign:
                                "center",

                            opacity:
                                ".7",

                            padding:
                                "8px",

                            border:
                                "1px solid rgba(255,255,255,.08)",

                            borderRadius:
                                "5px",
                        },
                    }
                )
            );
        }

        return panel;
        }

    function parsePageNumber(
        value
    ) {
        const number =
            Number(
                String(
                    value ?? ""
                )
                    .replace(
                        /,/g,
                        ""
                    )
                    .trim()
            );

        return Number.isFinite(
            number
        )
            ? number
            : null;
    }

    function readVisibleBarsFromPage() {
        const mainContainer =
            document.querySelector(
                "#mainContainer"
            );

        if (!mainContainer) {
            return null;
        }

        const text =
            mainContainer.textContent ||
            "";

        /*
         * Torn places the countdown immediately after the
         * maximum value in textContent:
         *
         * Energy:90/15006:25
         * Happy:4914/502511:25
         *
         * The lazy maximum capture stops when the MM:SS
         * countdown begins.
         */
        const energyMatch =
            text.match(
                /Energy:\s*([\d,]+)\s*\/\s*([\d,]+?)(?=\d{2}:\d{2}|FULL|$)/i
            );

        const happinessMatch =
            text.match(
                /Happy:\s*([\d,]+)\s*\/\s*([\d,]+?)(?=\d{2}:\d{2}|FULL|$)/i
            );

        return {
            energy:
                energyMatch
                    ? {
                        current:
                            parsePageNumber(
                                energyMatch[1]
                            ),

                        maximum:
                            parsePageNumber(
                                energyMatch[2]
                            ),
                    }
                    : null,

            happiness:
                happinessMatch
                    ? {
                        current:
                            parsePageNumber(
                                happinessMatch[1]
                            ),

                        maximum:
                            parsePageNumber(
                                happinessMatch[2]
                            ),
                    }
                    : null,
        };
    }

    function renderGymTrainingBonuses() {
        if (
            !isGymPage() ||
            !training
        ) {
            return;
        }

        const gymRoot =
            document.querySelector(
                "#gymroot"
            );

        if (!gymRoot) {
            return;
        }

        const data =
            repository.inspect();

        const stats = [
            "strength",
            "defense",
            "speed",
            "dexterity",
        ];

        const rows =
            gymRoot.querySelectorAll(
                "li"
            );

        for (
            const stat of
            stats
        ) {
            const label =
                stat
                    .charAt(0)
                    .toUpperCase() +
                stat.slice(1);

            const row =
                [...rows].find(
                    item =>
                        String(
                            item.textContent ||
                            ""
                        )
                            .trim()
                            .startsWith(
                                label
                            )
                );

            if (!row) {
                continue;
            }

            row.querySelector(
                ".tactic-training-bonus"
            )?.remove();

            const valueElement =
                [...row.querySelectorAll(
                    "span, div"
                )].find(
                    element => {
                        const text =
                            String(
                                element.textContent ||
                                ""
                            ).trim();

                        return /^[\d,]+$/.test(
                            text
                        );
                    }
                );

            if (!valueElement) {
                continue;
            }

            const modifiers =
                training.getTrainingModifiers({
                    stat,

                    factionUpgrades:
                        data?.factionUpgrades,

                    userPerks:
                        data?.userPerks,

                    tornCalendar:
                        data?.tornCalendar,

                    userCalendar:
                        data?.userCalendar,
                });

            const totalPercent =
                Number(
                    modifiers?.totalPercent
                ) || 0;

            const bonus =
                document.createElement(
                    "div"
                );

            bonus.className =
                "tactic-training-bonus";

            bonus.textContent =
                totalPercent > 0
                    ? `TACTIC Bonus: +${totalPercent}%`
                    : "TACTIC Bonus: none";

            Object.assign(
                bonus.style,
                {
                    color:
                        "#4da6ff",

                    fontSize:
                        "11px",

                    lineHeight:
                        "12px",

                    marginTop:
                        "-1px",

                    marginBottom:
                        "0",

                    textAlign:
                        "center",

                    width:
                        "100%",

                    whiteSpace:
                        "nowrap",

                    fontWeight:
                        "500",

                    position:
                        "relative",

                    top:
                        "-2px",
                }
            );

            valueElement.insertAdjacentElement(
                "afterend",
                bonus
            );
        }
    }

    function readGymStatsFromPage() {
        const gymRoot =
            document.querySelector(
                "#gymroot"
            );

        if (!gymRoot) {
            return null;
        }

        const result = {};

        const stats =
            [
                "strength",
                "defense",
                "speed",
                "dexterity",
            ];

        const rows =
            gymRoot.querySelectorAll(
                "li"
            );

        for (
            const stat of
            stats
        ) {
            const label =
                stat
                    .charAt(0)
                    .toUpperCase() +
                stat.slice(1);

            const row =
                [...rows].find(
                    item =>
                        String(
                            item.textContent ||
                            ""
                        )
                            .trim()
                            .startsWith(
                                label
                            )
                );

            if (!row) {
                continue;
            }

            const valueElement =
                [...row.querySelectorAll(
                    "span, div"
                )].find(
                    element => {
                        const text =
                            String(
                                element.textContent ||
                                ""
                            ).trim();

                        return /^[\d,]+$/.test(
                            text
                        );
                    }
                );

            if (!valueElement) {
                continue;
            }

            const value =
                parsePageNumber(
                    valueElement.textContent
                );

            if (
                value !== null
            ) {
                result[
                    stat
                ] =
                    value;
            }
        }

        return result;
    }

    function captureVisiblePageSnapshot() {
        const bars =
            readVisibleBarsFromPage();

        const battlestats =
            isGymPage()
                ? readGymStatsFromPage()
                : null;

        livePageSnapshot = {
            capturedAt:
                Date.now(),

            energy:
                bars?.energy ||
                null,

            happiness:
                bars?.happiness ||
                null,

            battlestats:
                battlestats ||
                {},
        };

        return livePageSnapshot;
    }

    function getDisplayData() {
        const data =
            repository.inspect();

        const snapshot =
            livePageSnapshot;

        if (!snapshot) {
            return data;
        }

        if (
            snapshot.energy &&
            data?.bars?.energy
        ) {
            data.bars.energy = {
                ...data.bars.energy,

                current:
                    snapshot
                        .energy
                        .current,

                maximum:
                    snapshot
                        .energy
                        .maximum,
            };
        }

        if (
            snapshot.happiness &&
            data?.bars?.happy
        ) {
            data.bars.happy = {
                ...data.bars.happy,

                current:
                    snapshot
                        .happiness
                        .current,

                maximum:
                    snapshot
                        .happiness
                        .maximum,
            };
        }

        for (
            const [
                stat,
                value,
            ] of
            Object.entries(
                snapshot
                    .battlestats ||
                {}
            )
        ) {
            if (
                data
                    ?.battlestats
                    ?.[stat]
            ) {
                data
                    .battlestats[
                        stat
                    ]
                    .value =
                    value;
            }
        }

        /*
         * Energy/Happiness regeneration now starts from the
         * visible-page snapshot rather than the older API snapshot.
         */
        data.loadedAt =
            snapshot.capturedAt;

        return data;
    }

    function parseTctStartTime(
        value
    ) {
        const match =
            String(
                value || ""
            )
                .trim()
                .match(
                    /^(\d{1,2}):(\d{2})\s*TCT$/i
                );

        if (!match) {
            return null;
        }

        const hours =
            Number(
                match[1]
            );

        const minutes =
            Number(
                match[2]
            );

        if (
            !Number.isInteger(
                hours
            ) ||
            !Number.isInteger(
                minutes
            ) ||
            hours < 0 ||
            hours > 23 ||
            minutes < 0 ||
            minutes > 59
        ) {
            return null;
        }

        return {
            hours,
            minutes,

            seconds:
                (
                    hours *
                    60 *
                    60
                ) +
                (
                    minutes *
                    60
                ),
        };
    }

    function getPersonalizedEventWindow({
        event,
        userCalendar,
    } = {}) {
        const globalStart =
            Number(
                event?.start
            );

        const globalEnd =
            Number(
                event?.end
            );

        if (
            !Number.isFinite(
                globalStart
            ) ||
            !Number.isFinite(
                globalEnd
            ) ||
            globalEnd <
                globalStart
        ) {
            return null;
        }

        if (
            event
                ?.fixed_start_time ===
            true
        ) {
            return {
                start:
                    globalStart,

                end:
                    globalEnd,
            };
        }

        const personalStart =
            parseTctStartTime(
                userCalendar
                    ?.calendar
                    ?.start_time
            );

        if (!personalStart) {
            return {
                start:
                    globalStart,

                end:
                    globalEnd,
            };
        }

        const duration =
            globalEnd -
            globalStart;

        const start =
            globalStart +
            personalStart.seconds;

        return {
            start,

            end:
                start +
                duration,
        };
    }

    function getCaffeineConModifier({
        tornCalendar,
        userCalendar,
        now =
            Math.floor(
                Date.now() /
                1000
            ),
    } = {}) {
        const events =
            tornCalendar
                ?.calendar
                ?.events;

        if (
            !Array.isArray(
                events
            )
        ) {
            return {
                active:
                    false,

                multiplier:
                    1,

                event:
                    null,
            };
        }

        const caffeineCon =
            events.find(
                event =>
                    /^CaffeineCon\b/i.test(
                        String(
                            event
                                ?.title ||
                            ""
                        )
                    )
            );

        if (!caffeineCon) {
            return {
                active:
                    false,

                multiplier:
                    1,

                event:
                    null,
            };
        }

        const window =
            getPersonalizedEventWindow({
                event:
                    caffeineCon,

                userCalendar,
            });

        if (!window) {
            return {
                active:
                    false,

                multiplier:
                    1,

                event:
                    caffeineCon,
            };
        }

        const active =
            now >=
                window.start &&
            now <=
                window.end;

        return {
            active,

            multiplier:
                active
                    ? 2
                    : 1,

            event:
                caffeineCon,

            start:
                window.start,

            end:
                window.end,
        };
    }

    function getEnergyDrinkEventModifiers({
        tornCalendar,
        userCalendar,
    } = {}) {
        const modifiers =
            [];

        const caffeineCon =
            getCaffeineConModifier({
                tornCalendar,

                userCalendar,
            });

        if (
            caffeineCon.active
        ) {
            modifiers.push({
                id:
                    "caffeine-con",

            source:
                "event",

                label:
                    caffeineCon
                        ?.event
                        ?.title ||
                    "CaffeineCon",

                active:
                    true,

                multiplier:
                    caffeineCon
                        .multiplier,

                display:
                    `×${caffeineCon.multiplier} CaffeineCon`,

                start:
                    caffeineCon.start,

                end:
                    caffeineCon.end,
            });
        }

        return modifiers;
    }

    function getEnergyDrinkBookModifier(
        userPerks
    ) {
        const bookPerks =
            userPerks
                ?.perks
                ?.book;

        if (
            !Array.isArray(
                bookPerks
            )
        ) {
            return {
                id:
                    "book-energy-drink",

                source:
                    "book",

                label:
                    "Book",

                active:
                    false,

                multiplier:
                    1,

                display:
                    null,
            };
        }

        const activeBookPerk =
            bookPerks.find(
                perk => {
                    const text =
                        String(
                            perk || ""
                        )
                            .trim()
                            .toLowerCase();

                    return (
                        text.includes(
                            "energy drink"
                        ) &&
                        (
                            text.includes(
                                "double"
                            ) ||
                            text.includes(
                                "doubled"
                            ) ||
                            text.includes(
                                "100%"
                            )
                        )
                    );
                }
            );

        if (!activeBookPerk) {
            return {
                id:
                    "book-energy-drink",

                source:
                    "book",

                label:
                    "Book",

                active:
                    false,

                multiplier:
                    1,

                display:
                    null,
            };
        }

        return {
            id:
                "book-energy-drink",

            source:
                "book",

            label:
                "Energy Drink Book",

            active:
                true,

            multiplier:
                2,

            display:
                "×2 book",

            perk:
                activeBookPerk,
        };
    }

    function getEnergyDrinkModifiers({
        userPerks,
        tornCalendar,
        userCalendar,
    } = {}) {
        const modifiers =
            [];

        const factionModifier =
        getEnergyDrinkFactionModifier(
            userPerks
        );

    if (
        factionModifier.active
    ) {
        modifiers.push(
            factionModifier
        );
    }

    const bookModifier =
        getEnergyDrinkBookModifier(
            userPerks
        );

    if (
        bookModifier.active
    ) {
        modifiers.push(
            bookModifier
        );
    }

    modifiers.push(
        ...getEnergyDrinkEventModifiers({
            tornCalendar,

            userCalendar,
        })
    );

        return combineMultipliers(
            modifiers
        );
    }

    function combineMultipliers(
        modifiers
    ) {
        const normalized =
            Array.isArray(modifiers)
                ? modifiers
                : [];

        let multiplier =
            1;

        const activeModifiers =
            [];

        for (
            const modifier of
            normalized
        ) {
            if (
                !modifier ||
                modifier.active ===
                    false
            ) {
                continue;
            }

            const value =
                Number(
                    modifier.multiplier
                );

            if (
                !Number.isFinite(
                    value
                ) ||
                value <= 0
            ) {
                continue;
            }

            multiplier *=
                value;

            activeModifiers.push({
                ...modifier,

                multiplier:
                    value,
            });
        }

        return {
            multiplier,

            modifiers:
                activeModifiers,
        };
    }

    function getEnergyDrinkFactionBonusPercent(
        userPerks
    ) {
        const factionPerks =
            userPerks
                ?.perks
                ?.faction;

        if (
            !Array.isArray(
                factionPerks
            )
        ) {
            return 0;
        }

        let bonusPercent =
            0;

        for (
            const perk of
            factionPerks
        ) {
            const text =
                String(
                    perk || ""
                );

            const match =
                text.match(
                    /\+\s*(\d+(?:\.\d+)?)%\s+energy\s+(?:gain\s+)?from\s+energy\s+drinks/i
                );

            if (!match) {
                continue;
            }

            const value =
                Number(
                    match[1]
                );

            if (
                Number.isFinite(
                    value
                )
            ) {
                bonusPercent =
                    Math.max(
                        bonusPercent,
                        value
                    );
            }
        }

        return bonusPercent;
    }

    function getEnergyDrinkFactionModifier(
        userPerks
    ) {
        const percent =
            getEnergyDrinkFactionBonusPercent(
                userPerks
            );

        if (
            percent <= 0
        ) {
            return {
                id:
                    "faction-energy-drink",

                source:
                    "faction",

                label:
                    "Faction",

                active:
                    false,

                multiplier:
                    1,

                percent:
                    0,

                display:
                    null,
            };
        }

        const multiplier =
            1 +
            (
                percent /
                100
            );

        return {
            id:
                "faction-energy-drink",

            source:
                "faction",

            label:
                "Faction",

            active:
                true,

            multiplier,

            percent,

            display:
                `+${percent}% faction`,
        };
    }

    function getEnergyDrinkEffect({
        baseEnergy,
        userPerks,
        tornCalendar,
        userCalendar,
    } = {}) {
        const base =
            Math.max(
                0,
                Number(
                    baseEnergy
                ) || 0
            );

        const modifierResult =
            getEnergyDrinkModifiers({
                userPerks,

                tornCalendar,

                userCalendar,
            });

        const effectiveEnergy =
            Math.round(
                base *
                modifierResult
                    .multiplier
            );

        return {
            baseEnergy:
                base,

            effectiveEnergy,

            multiplier:
                modifierResult
                    .multiplier,

            modifiers:
                modifierResult
                    .modifiers,
        };
    }

    function getMaximumBoosterCooldownHours(
        userPerks
    ) {
        const BASE_BOOSTER_COOLDOWN_HOURS =
            24;

        const factionPerks =
            userPerks?.perks?.faction;

        if (
            !Array.isArray(
                factionPerks
            )
        ) {
            return BASE_BOOSTER_COOLDOWN_HOURS;
        }

        let bonusHours =
            0;

        for (
            const perk of
            factionPerks
        ) {
            const text =
                String(
                    perk || ""
                );

            const match =
                text.match(
                    /\+\s*(\d+(?:\.\d+)?)\s*hours?\s+maximum\s+booster\s+cooldown/i
                );

            if (!match) {
                continue;
            }

            const value =
                Number(
                    match[1]
                );

            if (
                Number.isFinite(
                    value
                )
            ) {
                bonusHours =
                    Math.max(
                        bonusHours,
                        value
                    );
            }
        }

        return (
            BASE_BOOSTER_COOLDOWN_HOURS +
            bonusHours
        );
    }

    function optimizeBoosterMix({
        requestedDrinks = 0,
        requestedFhc = 0,
        energyPerDrink = 0,
        maximumEnergy = 0,
        cooldownLimit =
            SUSTAINABLE_BOOSTER_HOURS_PER_DAY,
    } = {}) {
        const drinksLimit =
            Math.max(
                0,
                Math.round(
                    Number(
                        requestedDrinks
                    ) || 0
                )
            );

        const fhcLimit =
            Math.max(
                0,
                Math.round(
                    Number(
                        requestedFhc
                    ) || 0
                )
            );

        const drinkEnergy =
            Math.max(
                0,
                Number(
                    energyPerDrink
                ) || 0
            );

        const fhcEnergy =
            Math.max(
                0,
                Number(
                    maximumEnergy
                ) || 0
            );

        const maximumCooldown =
            Math.max(
                0,
                Number(
                    cooldownLimit
                ) || 0
            );

        let bestPlan = {
            drinks:
                0,

            fhc:
                0,

            cooldownHours:
                0,

            energyPerDay:
                0,
        };

        for (
            let fhcCount = 0;
            fhcCount <= fhcLimit;
            fhcCount += 1
        ) {
            for (
                let drinkCount = 0;
                drinkCount <= drinksLimit;
                drinkCount += 1
            ) {
                const cooldownHours =
                    (
                        fhcCount *
                        6
                    ) +
                    (
                        drinkCount *
                        2
                    );

                if (
                    cooldownHours >
                    maximumCooldown
                ) {
                    continue;
                }

                const energyPerDay =
                    (
                        fhcCount *
                        fhcEnergy
                    ) +
                    (
                        drinkCount *
                        drinkEnergy
                    );

                const moreEnergy =
                    energyPerDay >
                    bestPlan.energyPerDay;

                const sameEnergyLessCooldown =
                    energyPerDay ===
                        bestPlan.energyPerDay &&
                    cooldownHours <
                        bestPlan.cooldownHours;

                if (
                    moreEnergy ||
                    sameEnergyLessCooldown
                ) {
                    bestPlan = {
                        drinks:
                            drinkCount,

                        fhc:
                            fhcCount,

                        cooldownHours,

                        energyPerDay,
                    };
                }
            }
        }

        return {
            ...bestPlan,

            drinkEfficiency:
                drinkEnergy > 0
                    ? drinkEnergy /
                        2
                    : 0,

            fhcEfficiency:
                fhcEnergy > 0
                    ? fhcEnergy /
                        6
                    : 0,
        };
    }

    function calculatePlannerTime({
        energyRequired,
        currentEnergy,
        maximumEnergy,
        energyIncrement,
        energyInterval,
        settings,
        userPerks,
        tornCalendar,
        userCalendar,
    } = {}) {
        const required =
            Math.max(
                0,
                Number(
                    energyRequired
                ) || 0
            );

        const current =
            Math.max(
                0,
                Number(
                    currentEnergy
                ) || 0
            );

        const maximum =
            Math.max(
                0,
                Number(
                    maximumEnergy
                ) || 0
            );

        const increment =
            Math.max(
                0,
                Number(
                    energyIncrement
                ) || 0
            );

        const interval =
            Math.max(
                0,
                Number(
                    energyInterval
                ) || 0
            );

        if (
            required <= 0 ||
            increment <= 0 ||
            interval <= 0
        ) {
            return null;
        }

        const remainingEnergy =
            Math.max(
                0,
                required -
                    current
            );

        const naturalEnergyPerDay =
            (
                increment *
                86400
            ) /
            interval;

        /*
         * Daily refill.
         *
         * For planning, assume the player uses the refill
         * efficiently when their Energy is near empty.
         */
        const refillEnergyPerDay =
            settings?.dailyRefill
                ? maximum
                : 0;

        /*
         * Xanax.
         *
         * User chooses 1-3 intended doses per day.
         * Each successful Xanax provides 250 Energy.
         */
        const xanaxPerDay =
            settings?.xanaxEnabled
                ? Math.min(
                    3,
                    Math.max(
                        1,
                        Number(
                            settings.xanaxPerDay
                        ) || 1
                    )
                )
                : 0;

        const xanaxEnergyPerDay =
            xanaxPerDay *
            250;

        /*
         * Booster cooldown.
         *
         * Energy Drink = 2 hours
         * FHC          = 6 hours
         *
         * For a sustainable repeating daily schedule,
         * limit total requested booster usage to 24 hours
         * of cooldown generated per day.
         */
        let requestedDrinks =
            settings
                ?.energyDrinksEnabled
                ? Math.max(
                    0,
                    Math.round(
                        Number(
                            settings
                                .energyDrinksPerDay
                        ) || 0
                    )
                )
                : 0;

        let requestedFhc =
            settings?.fhcEnabled
                ? Math.max(
                    0,
                    Math.round(
                        Number(
                            settings.fhcPerDay
                        ) || 0
                    )
                )
                : 0;

        const maximumBoosterCooldownHours =
            getMaximumBoosterCooldownHours(
                userPerks
            );

        const sustainableBoosterHoursPerDay =
            SUSTAINABLE_BOOSTER_HOURS_PER_DAY;

        const energyDrinkEffect =
            getEnergyDrinkEffect({
                baseEnergy:
                    settings
                        .baseEnergyPerDrink,

                userPerks,

                tornCalendar,

                userCalendar,
            });

        const energyPerDrink =
            energyDrinkEffect
                .effectiveEnergy;

        const bestBoosterPlan =
            optimizeBoosterMix({
                requestedDrinks,

                requestedFhc,

                energyPerDrink,

                maximumEnergy:
                    maximum,

                cooldownLimit:
                    sustainableBoosterHoursPerDay,
            });

        const usableFhc =
            bestBoosterPlan.fhc;

        const usableDrinks =
            bestBoosterPlan.drinks;

        const drinkEnergyPerDay =
            usableDrinks *
            energyPerDrink;

        const fhcEnergyPerDay =
            usableFhc *
            maximum;

        const selectedExtraEnergyPerDay =
            refillEnergyPerDay +
            xanaxEnergyPerDay +
            drinkEnergyPerDay +
            fhcEnergyPerDay;

        const totalEnergyPerDay =
            naturalEnergyPerDay +
            selectedExtraEnergyPerDay;

        const naturalSeconds =
            (
                remainingEnergy /
                naturalEnergyPerDay
            ) *
            86400;

        const refillOnlyEnergyPerDay =
            naturalEnergyPerDay +
            refillEnergyPerDay;

        const refillSeconds =
            refillOnlyEnergyPerDay > 0
                ? (
                    remainingEnergy /
                    refillOnlyEnergyPerDay
                ) *
                    86400
                : null;

        const selectedSeconds =
            totalEnergyPerDay > 0
                ? (
                    remainingEnergy /
                    totalEnergyPerDay
                ) *
                    86400
                : null;

        return {
            remainingEnergy,

            maximumBoosterCooldownHours,

            sustainableBoosterHoursPerDay,

            optimizedBoosterCooldownHours:
                bestBoosterPlan
                    .cooldownHours,

            naturalEnergyPerDay,

            refillEnergyPerDay,

            xanaxPerDay,
            xanaxEnergyPerDay,

            requestedDrinks,
            usableDrinks,
            drinkEnergyPerDay,

            requestedFhc,
            usableFhc,
            fhcEnergyPerDay,

            selectedExtraEnergyPerDay,
            totalEnergyPerDay,

            naturalSeconds,
            refillSeconds,
            selectedSeconds,

            boosterLimited:
                usableDrinks !==
                    requestedDrinks ||
                usableFhc !==
                    requestedFhc,
        };
    }

    function createStatCard(
        key,
        label,
        data,
        goals
    ) {
        const stat =
            data?.battlestats
                ?.[key] ||
            null;

        const current =
            Number(
                stat?.value
            ) || 0;

        const goal =
            Number(
                goals?.[key]
            ) || 0;

        const progress =
            goal > 0
                ? Math.min(
                      100,
                      (
                          current /
                          goal
                      ) * 100
                  )
                : 0;

        const happiness =
            Number(
                data?.bars?.happy?.current
            ) || 0;

        const trainingModifiers =
            training.getTrainingModifiers({
                stat:
                    key,

                factionUpgrades:
                    data?.factionUpgrades,

                userPerks:
                    data?.userPerks,

                tornCalendar:
                    data?.tornCalendar,

                userCalendar:
                    data?.userCalendar,
            });

        const plan =
            goal > current
                ? training.planGoal({
                    stat:
                        key,

                    currentStat:
                        current,

                    targetStat:
                        goal,

                    happiness,

                    gyms:
                        data?.gyms || [],

                    activeGym:
                        data?.activeGym,

                    battlestats:
                        data?.battlestats,

                    knownSpecialistGymIds:
                        data
                            ?.knownSpecialistGymIds,

                    trainingMultiplier:
                        trainingModifiers
                            .multiplier,
                })
                : null;

        const energyBar =
            data?.bars?.energy;

        const plannerSettings =
            getPlannerSettings();

        const naturalEnergyPlan =
            plan?.estimatedEnergy > 0
                ? training.estimateNaturalEnergyTime({
                    energyRequired:
                        plan.estimatedEnergy,

                    currentEnergy:
                        energyBar?.current,

                    energyIncrement:
                        energyBar?.increment,

                    energyInterval:
                        energyBar?.interval,
                })
                : null;

        const selectedPlannerPlan =
            plan?.estimatedEnergy > 0
                ? calculatePlannerTime({
                    energyRequired:
                        plan.estimatedEnergy,

                    currentEnergy:
                        energyBar?.current,

                    maximumEnergy:
                        energyBar?.maximum,

                    energyIncrement:
                        energyBar?.increment,

                    energyInterval:
                        energyBar?.interval,

                    settings:
                        plannerSettings,

                    userPerks:
                        data?.userPerks,

                    tornCalendar:
                        data?.tornCalendar,

                    userCalendar:
                        data?.userCalendar,
                })
                : null;

        const card =
            createElement(
                "div",
                {
                    styles: {
                        padding:
                            "12px",

                        border:
                            "1px solid rgba(255,255,255,.12)",

                        borderRadius:
                            "7px",

                        background:
                            "rgba(255,255,255,.035)",

                        display:
                            "flex",

                        flexDirection:
                            "column",

                        alignItems:
                            "center",

                        textAlign:
                            "center",

                        gap:
                            "7px",

                        minWidth:
                            "0",
                    },
                }
            );

        const title =
            createElement(
                "div",
                {
                    text:
                        label,

                    styles: {
                        fontWeight:
                            "700",

                        fontSize:
                            "16px",

                        textAlign:
                            "center",
                    },
                }
            );

        const currentRow =
            createElement(
                "div",
                {
                    text:
                        formatBattleStat(
                            current
                        ),

                    styles: {
                        fontSize:
                            "16px",

                        fontWeight:
                            "700",

                        lineHeight:
                            "1.1",

                        whiteSpace:
                            "nowrap",

                        letterSpacing:
                            "-0.02em",

                        textAlign:
                            "center",
                    },
                }
            );

        const modifierRow =
            createElement(
                "div",
                {
                    text:
                        `Combat bonus: +${stat?.modifier ?? 0}%`,

                    styles: {
                        opacity:
                            ".7",

                        fontSize:
                            "12px",

                        textAlign:
                            "center",
                    },
                }
            );

        const goalInput =
            document.createElement(
                "input"
            );

        goalInput.type =
            "number";

        goalInput.min =
            "0";

        goalInput.step =
            "1";

        goalInput.value =
            goal > 0
                ? String(goal)
                : "";

        goalInput.placeholder =
            "Target";

        goalInput.dataset.statGoal =
            key;

        Object.assign(
            goalInput.style,
            {
                width:
                    "100%",

                boxSizing:
                    "border-box",

                padding:
                    "7px 8px",

                borderRadius:
                    "5px",

                border:
                    "1px solid rgba(255,255,255,.15)",

                background:
                    "rgba(0,0,0,.2)",

                color:
                    "inherit",

                fontSize:
                    "12px",

                textAlign:
                    "center",
            }
        );

        const progressText =
            createElement(
                "div",
                {
                    text:
                        goal > 0
                            ? `${progress.toFixed(1)}% of goal`
                            : "No goal set",

                    styles: {
                        fontSize:
                            "12px",

                        opacity:
                            ".75",

                        textAlign:
                            "center",

                        width:
                            "100%",
                    },
                }
            );

        const progressTrack =
            createElement(
                "div",
                {
                    styles: {
                        width:
                            "100%",

                        height:
                            "4px",

                        borderRadius:
                            "999px",

                        overflow:
                            "hidden",

                        background:
                            "rgba(255,255,255,.08)",
                    },
                }
            );

        const progressFill =
            createElement(
                "div",
                {
                    styles: {
                        height:
                            "100%",

                        width:
                            `${progress}%`,

                        background:
                            "currentColor",

                        opacity:
                            ".65",
                    },
                }
            );

        progressTrack.appendChild(
            progressFill
        );

        let plannerBlock =
            null;

        if (
            plan?.recommendation
        ) {
            const recommendation =
                plan.recommendation;

            plannerBlock =
                createElement(
                    "div",
                    {
                        styles: {
                            width:
                                "100%",

                            marginTop:
                                "4px",

                            paddingTop:
                                "7px",

                            borderTop:
                                "1px solid rgba(255,255,255,.08)",

                            display:
                                "grid",

                            gap:
                                "3px",

                            textAlign:
                                "center",
                        },
                    }
                );

            plannerBlock.append(
                createElement(
                    "div",
                    {
                        text:
                            "TRAINING PLAN",

                        styles: {
                            fontSize:
                                "10px",

                            fontWeight:
                                "700",

                            opacity:
                                ".55",

                            letterSpacing:
                                ".07em",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            recommendation
                                .gymName,

                        styles: {
                            fontSize:
                                "13px",

                            fontWeight:
                                "700",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            trainingModifiers
                                .totalPercent >
                            0
                                ? `Training bonus: +${trainingModifiers.totalPercent}%`
                                : "Training bonus: none",

                        styles: {
                            fontSize:
                                "10px",

                            opacity:
                                ".65",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            `${formatCompactNumber(recommendation.gainPerTrain)} / train`,

                        styles: {
                            fontSize:
                                "11px",

                            opacity:
                                ".85",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            `${formatNumber(plan.estimatedTrains)} trains`,

                        styles: {
                            fontSize:
                                "11px",

                            opacity:
                                ".85",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            `${formatNumber(plan.estimatedEnergy)} E`,

                        styles: {
                            fontSize:
                                "11px",

                            opacity:
                                ".85",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            "Natural Energy:",

                        styles: {
                            marginTop:
                                "3px",

                            fontSize:
                                "10px",

                            opacity:
                                ".6",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            naturalEnergyPlan
                                ? formatDuration(
                                    naturalEnergyPlan.seconds
                                )
                                : "—",

                        styles: {
                            fontSize:
                                "11px",

                            fontWeight:
                                "600",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            "With Daily Refill:",

                        styles: {
                            marginTop:
                                "4px",

                            fontSize:
                                "10px",

                            opacity:
                                ".6",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            selectedPlannerPlan
                                ?.refillSeconds !==
                                null &&
                            selectedPlannerPlan
                                ?.refillSeconds !==
                                undefined
                                ? formatDuration(
                                    selectedPlannerPlan
                                        .refillSeconds
                                )
                                : "—",

                        styles: {
                            fontSize:
                                "11px",

                            fontWeight:
                                "600",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            "Selected Plan:",

                        styles: {
                            marginTop:
                                "4px",

                            fontSize:
                                "10px",

                            opacity:
                                ".6",

                            textAlign:
                                "center",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            selectedPlannerPlan
                                ?.selectedSeconds !==
                                null &&
                            selectedPlannerPlan
                                ?.selectedSeconds !==
                                undefined
                                ? formatDuration(
                                    selectedPlannerPlan
                                        .selectedSeconds
                                )
                                : "—",

                        styles: {
                            fontSize:
                                "12px",

                            fontWeight:
                                "700",

                            textAlign:
                                "center",
                        },
                    }
                )

            );
        }

        card.append(
            title,
            currentRow,
            modifierRow,
            goalInput,
            progressText,
            progressTrack
        );

        if (plannerBlock) {
            card.appendChild(
                plannerBlock
            );
        }

        return card;
    }

    function captureGoalDrafts(
        container
    ) {
        const drafts = {};

        if (!container) {
            return drafts;
        }

        for (
            const input of
            container.querySelectorAll(
                "[data-stat-goal]"
            )
        ) {
            drafts[
                input.dataset
                    .statGoal
            ] =
                input.value;
        }

        return drafts;
    }

    function restoreGoalDrafts(
        container,
        drafts
    ) {
        if (
            !container ||
            !drafts
        ) {
            return;
        }

        for (
            const input of
            container.querySelectorAll(
                "[data-stat-goal]"
            )
        ) {
            const key =
                input.dataset
                    .statGoal;

            if (
                Object.prototype
                    .hasOwnProperty
                    .call(
                        drafts,
                        key
                    )
            ) {
                input.value =
                    drafts[
                        key
                    ];
            }
        }
    }

    function projectBarValue(
        bar,
        loadedAt
    ) {
        const current =
            Number(
                bar?.current
            );

        const maximum =
            Number(
                bar?.maximum
            );

        const increment =
            Number(
                bar?.increment
            );

        const intervalSeconds =
            Number(
                bar?.interval
            );

        const tickSeconds =
            Number(
                bar?.tick_time
            );

        if (
            !Number.isFinite(current) ||
            !Number.isFinite(maximum) ||
            !Number.isFinite(increment) ||
            !Number.isFinite(intervalSeconds) ||
            !Number.isFinite(tickSeconds) ||
            !Number.isFinite(loadedAt)
        ) {
            return current;
        }

        if (
            current >= maximum
        ) {
            return current;
        }

        const elapsedSeconds =
            Math.max(
                0,
                (
                    Date.now() -
                    loadedAt
                ) / 1000
            );

        let ticks =
            0;

        if (
            elapsedSeconds >=
            tickSeconds
        ) {
            ticks =
                1 +
                Math.floor(
                    (
                        elapsedSeconds -
                        tickSeconds
                    ) /
                    intervalSeconds
                );
        }

        return Math.min(
            maximum,
            current +
                (
                    ticks *
                    increment
                )
        );
    }

    function stopLiveBars() {
        if (
            liveBarTimer !==
            null
        ) {
            globalThis.clearInterval(
                liveBarTimer
            );

            liveBarTimer =
                null;
        }

        statsContainer =
            null;
    }

    function updateLiveBars(
        container
    ) {
        if (
            !container ||
            !container.isConnected
        ) {
            return;
        }

        const data =
            getDisplayData();

        const energy =
            data?.bars?.energy;

        const happiness =
            data?.bars?.happy;

        const energyValue =
            container.querySelector(
                ".tactic-stats-energy-value"
            );

        const happinessValue =
            container.querySelector(
                ".tactic-stats-happiness-value"
            );

        if (
            energyValue &&
            energy
        ) {
            const projectedEnergy =
                projectBarValue(
                    energy,
                    data.loadedAt
                );

            energyValue.textContent =
                `${formatNumber(projectedEnergy)} / ${formatNumber(energy.maximum)}`;
        }

        if (
            happinessValue &&
            happiness
        ) {
            const projectedHappiness =
                projectBarValue(
                    happiness,
                    data.loadedAt
                );

            happinessValue.textContent =
                `${formatNumber(projectedHappiness)} / ${formatNumber(happiness.maximum)}`;
        }
    }

    function startLiveBars(
        container
    ) {
        if (
            liveBarTimer !==
            null
        ) {
            globalThis.clearInterval(
                liveBarTimer
            );
        }

        updateLiveBars(
            container
        );

        liveBarTimer =
            globalThis.setInterval(
                () => {
                    if (
                        !container ||
                        !container.isConnected
                    ) {
                        if (
                            liveBarTimer !==
                            null
                        ) {
                            globalThis.clearInterval(
                                liveBarTimer
                            );

                            liveBarTimer =
                                null;
                        }

                        return;
                    }

                    updateLiveBars(
                        container
                    );
                },
                LIVE_BAR_TICK_MS
            );
    }

    function isStatsDataFresh() {
        const data =
            repository.inspect();

        const loadedAt =
            Number(
                data?.loadedAt
            );

        if (
            !Number.isFinite(
                loadedAt
            ) ||
            loadedAt <= 0
        ) {
            return false;
        }

        return (
            Date.now() -
            loadedAt
        ) <= STATS_FRESH_MS;
    }

    async function refreshStatsData({
        rerender = true,
    } = {}) {
        if (
            statsRefreshInFlight
        ) {
            return false;
        }

        statsRefreshInFlight =
            true;

        try {
            await repository.refresh();

            if (
                rerender &&
                statsContainer &&
                statsContainer.isConnected
            ) {
                const drafts =
                    captureGoalDrafts(
                        statsContainer
                    );

                await render(
                    statsContainer
                );

                restoreGoalDrafts(
                    statsContainer,
                    drafts
                );

                startLiveBars(
                    statsContainer
                );
            }

            if (
                isGymPage()
            ) {
                renderGymTrainingBonuses();
            }

            return true;
        } catch (error) {
            logger?.warn(
                "Stats refresh failed",
                {
                    message:
                        error?.message ||
                        String(error),
                }
            );

            return false;
        } finally {
            statsRefreshInFlight =
                false;
        }
    }

    function isGymPage() {
        return (
            location.pathname
                .toLowerCase()
                .includes(
                    "gym"
                )
        );
    }

    async function syncOnGymEntry() {
        if (
            !isGymPage()
        ) {
            return;
        }

        if (
            !isStatsDataFresh()
        ) {
            await refreshStatsData({
                rerender:
                    true,
            });
        }

        renderGymTrainingBonuses();
    }

    function isGymLink(
        element
    ) {
        const link =
            element?.closest?.(
                "a[href]"
            );

        if (!link) {
            return null;
        }

        let url;

        try {
            url =
                new URL(
                    link.href,
                    location.href
                );
        } catch {
            return null;
        }

        const pathname =
            String(
                url.pathname || ""
            )
                .toLowerCase();

        if (
            !pathname.includes(
                "gym"
            )
        ) {
            return null;
        }

        return link;
    }

    function handleGymNavigationClick(
        event
    ) {
        const link =
            isGymLink(
                event.target
            );

        if (!link) {
            return;
        }

        /*
         * The user manually chose to navigate to the Gym.
         *
         * Give Torn time to complete the page transition, then
         * synchronize TACTIC once from the API.
         */
        globalThis.setTimeout(
            () => {
                if (
                    isGymPage()
                ) {
                    void syncOnGymEntry();
                }
            },
            750
        );
    }

    function isManualTrainButton(
        element
    ) {
        const button =
            element?.closest?.(
                "button.torn-btn"
            );

        if (!button) {
            return null;
        }

        const text =
            String(
                button.textContent ||
                ""
            )
                .trim()
                .toUpperCase();

        if (
            text !== "TRAIN" ||
            button.disabled
        ) {
            return null;
        }

        return button;
    }

    async function refreshFromVisibleGymPage(
        trainedStat,
        previousValue,
        attempts = 20,
        delayMs = 100,
        stableReadsRequired = 3
    ) {
        let lastValue =
            Number(previousValue);

        let stableReads =
            0;

        let latestSnapshot =
            null;

        for (
            let attempt = 0;
            attempt < attempts;
            attempt += 1
        ) {
            await new Promise(
                resolve =>
                    globalThis.setTimeout(
                        resolve,
                        delayMs
                    )
            );

            const snapshot =
                captureVisiblePageSnapshot();

            latestSnapshot =
                snapshot;

            const newValue =
                Number(
                    snapshot
                        ?.battlestats
                        ?.[trainedStat]
                );

            if (
                !Number.isFinite(
                    newValue
                )
            ) {
                continue;
            }

            /*
             * Torn animates the displayed battle-stat number after
             * training. Do not use the first value that differs from
             * the old value.
             *
             * Wait until the visible stat has remained unchanged
             * for several consecutive reads.
             */
            if (
                newValue ===
                lastValue
            ) {
                stableReads += 1;
            } else {
                lastValue =
                    newValue;

                stableReads =
                    0;
            }

            const statChanged =
                Number.isFinite(
                    Number(previousValue)
                )
                    ? newValue !==
                        Number(previousValue)
                    : true;

            if (
                statChanged &&
                stableReads >=
                    stableReadsRequired
            ) {
                break;
            }
        }

        /*
         * Capture one final snapshot after the value has settled.
         */
        latestSnapshot =
            captureVisiblePageSnapshot();

        if (
            statsContainer &&
            statsContainer.isConnected
        ) {
            const drafts =
                captureGoalDrafts(
                    statsContainer
                );

            await render(
                statsContainer
            );

            restoreGoalDrafts(
                statsContainer,
                drafts
            );

            startLiveBars(
                statsContainer
            );
        }

        if (
            isGymPage()
        ) {
            renderGymTrainingBonuses();
        }

        return Boolean(
            latestSnapshot
        );
    }

    function handleGymTrainClick(
        event
    ) {
        if (
            !isGymPage()
        ) {
            return;
        }

        const button =
            isManualTrainButton(
                event.target
            );

        if (!button) {
            return;
        }

        const row =
            button.closest(
                "li"
            );

        if (!row) {
            return;
        }

        const rowText =
            String(
                row.textContent ||
                ""
            )
                .trim()
                .toLowerCase();

        const stat =
            [
                "strength",
                "defense",
                "speed",
                "dexterity",
            ].find(
                key =>
                    rowText.startsWith(
                        key
                    )
            );

        if (!stat) {
            return;
        }

        const beforeStats =
            readGymStatsFromPage();

        const beforeValue =
            Number(
                beforeStats?.[stat]
            );

        void refreshFromVisibleGymPage(
            stat,
            beforeValue
        );
    }

    async function render(
        container
    ) {
        statsContainer =
            container;

        container.replaceChildren();

        const data =
            getDisplayData();

        const root =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "12px",

                        padding:
                            "4px 0",
                    },
                }
            );

        const header =
            createElement(
                "div"
            );

        const titleRow =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "flex",

                        alignItems:
                            "center",

                        gap:
                            "8px",
                    },
                }
            );

        const titleIcon =
            createElement(
                "span",
                {
                    text:
                        "🏋️",

                    styles: {
                        fontSize:
                            "18px",

                        lineHeight:
                            "1",
                    },
                }
            );

        const titleText =
            createElement(
                "div",
                {
                    text:
                        "Stats & Training",

                    styles: {
                        fontSize:
                            "20px",

                        fontWeight:
                            "700",
                    },
                }
            );

        titleRow.append(
            titleIcon,
            titleText
        );

        header.append(
            titleRow,

            createElement(
                "div",
                {
                    text:
                        "Battle stat goals and gym training planner",

                    styles: {
                        opacity:
                            ".7",

                        marginTop:
                            "3px",
                    },
                }
            )
        );

        root.appendChild(
            header
        );

        if (
            !data
                .apiKeyConfigured
        ) {
            const setup =
                createElement(
                    "div",
                    {
                        styles: {
                            display:
                                "grid",

                            gap:
                                "8px",

                            padding:
                                "12px",

                            border:
                                "1px solid rgba(255,255,255,.12)",

                            borderRadius:
                                "7px",
                        },
                    }
                );

            setup.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            "Torn API Key",

                        styles: {
                            fontWeight:
                                "700",
                        },
                    }
                )
            );

            const apiDisclosure =
                createElement(
                    "div",
                    {
                        styles: {
                            display:
                                "grid",

                            gap:
                                "6px",

                            padding:
                                "10px",

                            border:
                                "1px solid rgba(255,255,255,.10)",

                            borderRadius:
                                "6px",

                            background:
                                "rgba(255,255,255,.025)",

                            fontSize:
                                "11px",

                            lineHeight:
                                "1.4",
                        },
                    }
                );

            apiDisclosure.append(
                createElement(
                    "div",
                    {
                        text:
                            "TACTIC API ACCESS",

                        styles: {
                            fontWeight:
                                "700",

                            textAlign:
                                "center",

                            letterSpacing:
                                ".06em",
                        },
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            "Purpose: TACTIC uses the Torn API to read account information required by its enabled features, including battle stats, bars, gym information, perks, faction bonuses, and other data used to calculate recommendations.",
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            "Data storage: API data used by TACTIC is processed locally in your browser. TACTIC does not operate a remote server for storing your Torn account data.",
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            "Data sharing: TACTIC does not send your Torn API data to TACTIC or third-party servers.",
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            "API key storage: Your API key is stored locally in Violentmonkey storage on this browser and is not shared by TACTIC.",
                    }
                ),

                createElement(
                    "div",
                    {
                        text:
                            "API access: TACTIC currently supports a Limited Access key. Restricted custom API keys containing only TACTIC's required selections will be supported.",
                    }
                )
            );

            setup.appendChild(
                apiDisclosure
            );

            const keyInput =
                document.createElement(
                    "input"
                );

            keyInput.type =
                "password";

            keyInput.placeholder =
                "Paste Torn API key";

            Object.assign(
                keyInput.style,
                {
                    padding:
                        "8px",

                    borderRadius:
                        "5px",

                    border:
                        "1px solid rgba(255,255,255,.15)",

                    background:
                        "rgba(0,0,0,.2)",

                    color:
                        "inherit",
                }
            );

            const save =
                createButton(
                    "Save API Key"
                );

            save.addEventListener(
                "click",
                async () => {
                    if (
                        !repository
                            .setApiKey(
                                keyInput
                                    .value
                            )
                    ) {
                        return;
                    }

                    save.textContent =
                        "Loading...";

                    try {
                        await refreshStatsData({
                            rerender:
                                true,
                        });
                    } catch (
                        error
                    ) {
                        save.textContent =
                            error?.message ||
                            "API Error";
                    }
                }
            );

            setup.append(
                keyInput,
                save
            );

            root.appendChild(
                setup
            );

            container.appendChild(
                root
            );

            return;
        }

        const controls =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0, 1fr))",

                        gap:
                            "8px",
                    },
                }
            );

        const refresh =
            createButton(
                data.loading
                    ? "Refreshing..."
                    : "Refresh Data"
            );

        refresh.disabled =
            data.loading;

        refresh.addEventListener(
            "click",
            async () => {
                refresh.disabled =
                    true;

                refresh.textContent =
                    "Refreshing...";

                try {
                    await refreshStatsData({
                        rerender:
                            true,
                    });
                } catch (
                    error
                ) {
                    refresh.disabled =
                        false;

                    refresh.textContent =
                        error?.message ||
                        "Refresh Failed";
                }
            }
        );

        const clearKey =
            createButton(
                "Change API Key"
            );

        clearKey.addEventListener(
            "click",
            async () => {
                repository
                    .clearApiKey();

                await render(
                    container
                );
            }
        );

        controls.append(
            refresh,
            clearKey
        );

        root.appendChild(
            controls
        );

        const bars =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0, 1fr))",

                        gap:
                            "8px",
                    },
                }
            );

        const energy =
            data.bars
                ?.energy;

        const happy =
            data.bars
                ?.happy;

        const energyCard =
            createElement(
                "div",
                {
                    styles: {
                        padding:
                            "10px 8px",

                        border:
                            "1px solid rgba(255,255,255,.1)",

                        borderRadius:
                            "6px",

                        display:
                            "flex",

                        flexDirection:
                            "column",

                        alignItems:
                            "center",

                        justifyContent:
                            "center",

                        textAlign:
                            "center",

                        gap:
                            "4px",
                    },
                }
            );

        energyCard.append(
            createElement(
                "div",
                {
                    text:
                        "Energy:",

                    styles: {
                        fontSize:
                            "13px",

                        fontWeight:
                            "500",

                        textAlign:
                            "center",
                    },
                }
            ),

            createElement(
                "div",
                {
                    text:
                        `${formatNumber(energy?.current)} / ${formatNumber(energy?.maximum)}`,

                    className:
                        "tactic-stats-energy-value",

                    styles: {
                        fontSize:
                            "16px",

                        fontWeight:
                            "600",

                        textAlign:
                            "center",
                    },
                }
            )
        );

        const happinessCard =
            createElement(
                "div",
                {
                    styles: {
                        padding:
                            "10px 8px",

                        border:
                            "1px solid rgba(255,255,255,.1)",

                        borderRadius:
                            "6px",

                        display:
                            "flex",

                        flexDirection:
                            "column",

                        alignItems:
                            "center",

                        justifyContent:
                            "center",

                        textAlign:
                            "center",

                        gap:
                            "4px",
                    },
                }
            );

        happinessCard.append(
            createElement(
                "div",
                {
                    text:
                        "Happiness:",

                    styles: {
                        fontSize:
                            "13px",

                        fontWeight:
                            "500",

                        textAlign:
                            "center",
                    },
                }
            ),

            createElement(
                "div",
                {
                    text:
                        `${formatNumber(happy?.current)} / ${formatNumber(happy?.maximum)}`,

                    className:
                        "tactic-stats-happiness-value",

                    styles: {
                        fontSize:
                            "16px",

                        fontWeight:
                            "600",

                        textAlign:
                            "center",
                    },
                }
            )
        );

        bars.append(
            energyCard,
            happinessCard
        );

        root.appendChild(
            bars
        );

        const gymCard =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "flex",

                        flexDirection:
                            "column",

                        alignItems:
                            "center",

                        justifyContent:
                            "center",

                        textAlign:
                            "center",

                        gap:
                            "4px",

                        padding:
                            "12px 10px",

                        border:
                            "1px solid rgba(255,255,255,.1)",

                        borderRadius:
                            "6px",

                        background:
                            "rgba(255,255,255,.025)",
                    },
                }
            );

        gymCard.append(
            createElement(
                "div",
                {
                    text:
                        "ACTIVE GYM",

                    styles: {
                        fontSize:
                            "11px",

                        fontWeight:
                            "700",

                        opacity:
                            ".65",

                        letterSpacing:
                            ".08em",

                        textAlign:
                            "center",
                    },
                }
            ),

            createElement(
                "div",
                {
                    text:
                        formatActiveGym(
                            data.activeGym
                        ),

                    styles: {
                        fontSize:
                            "16px",

                        fontWeight:
                            "700",

                        textAlign:
                            "center",
                    },
                }
            )
        );

        root.appendChild(
            gymCard
        );

        const goals =
            data.goals;

        const grid =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0, 1fr))",

                        gap:
                            "10px",
                    },
                }
            );

        grid.append(
            createStatCard(
                "strength",
                "Strength",
                data,
                goals
            ),

            createStatCard(
                "defense",
                "Defense",
                data,
                goals
            ),

            createStatCard(
                "speed",
                "Speed",
                data,
                goals
            ),

            createStatCard(
                "dexterity",
                "Dexterity",
                data,
                goals
            )
        );

        root.appendChild(
            grid
        );

        const saveGoals =
            createButton(
                "Save Goals"
            );

        saveGoals.addEventListener(
            "click",
            async () => {
                const values = {};

                for (
                    const input of
                    root.querySelectorAll(
                        "[data-stat-goal]"
                    )
                ) {
                    values[
                        input.dataset
                            .statGoal
                    ] =
                        Number(
                            input.value
                        ) || 0;
                }

                repository.setGoals(
                    values
                );

                saveGoals.textContent =
                    "Goals Saved";

                globalThis.setTimeout(
                    () => {
                        saveGoals.textContent =
                            "Save Goals";
                    },
                    1200
                );

                await render(
                    container
                );
            }
        );

        root.appendChild(
            saveGoals
        );

        const plannerSettingsPanel =
            createPlannerSettingsPanel();

        root.appendChild(
            plannerSettingsPanel
        );

        if (
            data.lastError
        ) {
            root.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            data
                                .lastError
                                .message,

                        styles: {
                            color:
                                "#ffb4b4",

                            fontSize:
                                "12px",
                        },
                    }
                )
            );
        }

        container.appendChild(
            root
        );
    }

    TACTIC.registerModule({
        id:
            MODULE_ID,

        name:
            "Stats",

        icon:
            "🏋️",

        version:
            MODULE_VERSION,

        order:
            MODULE_ORDER,

        async init() {
            document.addEventListener(
                "click",
                handleGymTrainClick,
                true
            );

            document.addEventListener(
                "click",
                handleGymNavigationClick,
                true
            );

            if (
                isGymPage()
            ) {
                globalThis.setTimeout(
                    () => {
                        void syncOnGymEntry();
                    },
                    500
                );
            }

            logger?.info(
                "Stats module initialized"
            );

            return {
                success:
                    true,
            };
        },

        async render(
            container
        ) {
            statsContainer =
                container;

            /*
             * Opening the Stats drawer is a deliberate user action,
             * so synchronize once from the Torn API.
             */
            if (
                !isStatsDataFresh()
            ) {
                try {
                    await repository.refresh();
                } catch (error) {
                    logger?.warn(
                        "Initial Stats refresh failed",
                        {
                            message:
                                error?.message ||
                                String(error),
                        }
                    );
                }
            }

            captureVisiblePageSnapshot();

            const result =
                await render(
                    container
                );

            startLiveBars(
                container
            );

            return result;
        },

        destroy() {
            document.removeEventListener(
                "click",
                handleGymTrainClick,
                true
            );

            document.removeEventListener(
                "click",
                handleGymNavigationClick,
                true
            );

            stopLiveBars();

            logger?.info(
                "Stats module destroyed"
            );
        },
    });

    logger?.info(
        "Stats module loaded"
    );
})();