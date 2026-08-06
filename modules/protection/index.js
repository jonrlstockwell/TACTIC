/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/protection/index.js
 *
 * Purpose:
 * Provides the Wallet Protection application interface and
 * connects wallet data, Protection rules, settings, and shared
 * framework actions.
 *
 * Responsibilities:
 * - Register the Protection drawer module
 * - Subscribe to live wallet updates
 * - Evaluate the current wallet against Protection rules
 * - Display recommended deposit plans
 * - Allow the player to select a deposit destination
 * - Request the public deposit.prepare action
 * - Refresh when wallet or settings data changes
 * - Leave deposit submission entirely to the player
 *
 * Does NOT:
 * - Know Torn URLs
 * - Know deposit selectors
 * - Directly manipulate deposit forms
 * - Submit deposits
 * - Confirm deposits
 * - Perform developer-only automatic transactions
 *
 * Public API:
 * - Registered module: protection
 * - TACTIC.protection.inspect()
 * - TACTIC.protection.prepareDeposit()
 *
 * Dependencies:
 * - modules/protection/settings.js
 * - modules/protection/rules.js
 * - repositories/user/index.js
 * - services/actions/index.js
 * - services/actions/deposit.js
 * - services/deposit/index.js
 * - services/settings/index.js
 * - services/notifications/index.js
 * - ui/drawer/index.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Protection] Namespace is unavailable."
        );

        return;
    }

    if (
        !TACTIC.protection ||
        typeof TACTIC.protection !==
            "object"
    ) {
        TACTIC.protection = {};
    }

    const MODULE_ID =
        "protection";

    const ACTION_ID =
        "deposit.prepare";

    const AUTO_DEPOSIT_FEATURE_ID =
        "protection.autoDeposit";

    if (
        typeof TACTIC.use !==
        "function"
    ) {
        console.error(
            "[TACTIC Protection] Dependency Registry is unavailable."
        );

        return;
    }

    let dependencies;

    try {
        dependencies =
            TACTIC.use([
                "actions",
                "capabilities",
                "deposit",
                "drawer",
                "logger",
                "events",
                "notifications",
                "health",
                "user",
                "protection",
            ]);
    } catch (error) {
    console.error(
        "[TACTIC Protection] Required dependencies are unavailable.",
        {
            message:
                error?.message ||
                String(error),

            error,

            requestedDependencies: [
                "actions",
                "capabilities",
                "deposit",
                "drawer",
                "logger",
                "events",
                "notifications",
                "health",
                "user",
                "protection",
            ],
        }
    );

    return;
}

    const {
        actions,
        capabilities,
        deposit,
        drawer,
        logger,
        events,
        notifications,
        health,

        user:
            userRepository,

        protection,
    } = dependencies;

    /*
    * The Developer service is attached directly to
    * TACTIC.services rather than registered as a dependency.
    */
    const developer =
        TACTIC.services.developer;

    const settings =
        protection.settings;

    const rules =
        protection.rules;

    if (
        !settings ||
        !rules
    ) {
        console.error(
            "[TACTIC Protection] Protection settings or rules are unavailable."
        );

        return;
    }

    if (
        !actions.has(
            ACTION_ID
        )
    ) {
        console.error(
            `[TACTIC Protection] Required action "${ACTION_ID}" is not registered.`
        );

        return;
    }

    let unsubscribeWallet =
        null;

    let removeSettingsListener =
        null;

    const removeDeveloperListeners =
        [];

    let latestWallet =
        userRepository.getWallet();

    let latestEvaluation =
        null;

    let latestActionResult =
        null;

    let preparationInProgress =
        false;

    const metrics = {
        loadedAt:
            Date.now(),

        initializedAt:
            null,

        renders:
            0,

        walletUpdates:
            0,

        evaluations:
            0,

        settingsChanges:
            0,

        refreshRequests:
            0,

        refreshesCompleted:
            0,

        preparationRequests:
            0,

        preparationsCompleted:
            0,

        preparationsFailed:
            0,

        lastWalletUpdateAt:
            null,

        lastEvaluationAt:
            null,

        lastPreparationAt:
            null,

        lastActionState:
            null,

        lastActionReason:
            null,

        lastError:
            null,
    };

    function cloneValue(
        value
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            return value;
        }

        if (
            typeof structuredClone ===
            "function"
        ) {
            try {
                return structuredClone(
                    value
                );
            } catch {
                // Fall through.
            }
        }

        if (
            typeof value ===
                "object"
        ) {
            try {
                return JSON.parse(
                    JSON.stringify(
                        value
                    )
                );
            } catch {
                return value;
            }
        }

        return value;
    }

    function formatMoney(
        value
    ) {
        if (
            !Number.isFinite(
                value
            )
        ) {
            return "Unknown";
        }

        return new Intl.NumberFormat(
            "en-US",
            {
                style:
                    "currency",

                currency:
                    "USD",

                maximumFractionDigits:
                    0,
            }
        ).format(
            value
        );
    }

    function formatReason(
        reason
    ) {
        if (
            typeof reason !==
                "string" ||
            !reason
        ) {
            return "Unknown";
        }

        return reason
            .split("-")
            .map(
                (word) =>
                    word
                        .charAt(0)
                        .toUpperCase() +
                    word.slice(1)
            )
            .join(" ");
    }

    function getConfiguration() {
        return {
            enabled:
                settings.get(
                    "enabled"
                ),

            destination:
                settings.get(
                    "depositDestination"
                ),

            threshold:
                settings.get(
                    "threshold"
                ),

            reserve:
                settings.get(
                    "reserve"
                ),

            maximumAutomaticDeposit:
                settings.get(
                    "maximumAutomaticDeposit"
                ),

            duplicateCooldownMs:
                settings.get(
                    "duplicateCooldownMs"
                ),

            notifyOnTrigger:
                settings.get(
                    "notifyOnTrigger"
                ),

            notifyOnPrepared:
                settings.get(
                    "notifyOnPrepared"
                ),
        };
    }

    function evaluate() {
        metrics.evaluations +=
            1;

        metrics.lastEvaluationAt =
            Date.now();

        latestEvaluation =
            rules.evaluate(
                latestWallet,
                getConfiguration()
            );

        return latestEvaluation;
    }

    function getDestination(
        destinationId
    ) {
        return (
            deposit?.getDestination(
                destinationId
            ) ||
            null
        );
    }

    function getDestinations() {
        return (
            deposit?.listDestinations() ||
            []
        );
    }

    function isProtectionPageActive() {
        return (
            drawer
                ?.getActiveModuleId?.() ===
            MODULE_ID
        );
    }

    async function refreshIfActive() {
        metrics.refreshRequests +=
            1;

        if (
            !isProtectionPageActive()
        ) {
            return false;
        }

        await drawer
            .renderActiveModule();

        metrics.refreshesCompleted +=
            1;

        return true;
    }

    function createElement(
        tagName,
        options = {}
    ) {
        const element =
            document.createElement(
                tagName
            );

        if (
            options.text !==
            undefined
        ) {
            element.textContent =
                String(
                    options.text
                );
        }

        if (options.className) {
            element.className =
                options.className;
        }

        if (options.styles) {
            Object.assign(
                element.style,
                options.styles
            );
        }

        if (options.attributes) {
            for (
                const [
                    name,
                    value,
                ] of Object.entries(
                    options.attributes
                )
            ) {
                element.setAttribute(
                    name,
                    String(value)
                );
            }
        }

        return element;
    }

    function createCard(
        label,
        value,
        options = {}
    ) {
        const card =
            createElement(
                "div",
                {
                    styles: {
                        boxSizing:
                            "border-box",

                        padding:
                            "11px 12px",

                        border:
                            "1px solid rgba(255,255,255,.14)",

                        borderRadius:
                            "6px",

                        background:
                            "rgba(255,255,255,.035)",
                    },
                }
            );

        const labelElement =
            createElement(
                "div",
                {
                    text:
                        label,

                    styles: {
                        marginBottom:
                            "4px",

                        color:
                            "#999",

                        fontSize:
                            "11px",

                        fontWeight:
                            "700",

                        letterSpacing:
                            ".03em",

                        textTransform:
                            "uppercase",
                    },
                }
            );

        const valueElement =
            createElement(
                "div",
                {
                    text:
                        value,

                    styles: {
                        color:
                            options.color ||
                            "#f2f2f2",

                        fontSize:
                            options.large ===
                            false
                                ? "13px"
                                : "16px",

                        fontWeight:
                            options.large ===
                            false
                                ? "600"
                                : "700",

                        overflowWrap:
                            "anywhere",
                    },
                }
            );

        card.append(
            labelElement,
            valueElement
        );

        return card;
    }

    function createButton(
        text,
        onClick,
        options = {}
    ) {
        const button =
            createElement(
                "button",
                {
                    text,

                    attributes: {
                        type:
                            "button",
                    },

                    styles: {
                        boxSizing:
                            "border-box",

                        width:
                            "100%",

                        padding:
                            "10px 12px",

                        border:
                            "1px solid rgba(255,255,255,.18)",

                        borderRadius:
                            "5px",

                        background:
                            options.primary
                                ? "rgba(75,145,230,.28)"
                                : "rgba(255,255,255,.07)",

                        color:
                            "#fff",

                        cursor:
                            options.disabled
                                ? "not-allowed"
                                : "pointer",

                        fontSize:
                            "13px",

                        fontWeight:
                            "700",

                        opacity:
                            options.disabled
                                ? ".55"
                                : "1",
                    },
                }
            );

        button.disabled =
            options.disabled ===
            true;

        if (
            !button.disabled &&
            typeof onClick ===
                "function"
        ) {
            button.addEventListener(
                "click",
                onClick
            );
        }

        return button;
    }

    function createSectionHeading(
        text
    ) {
        return createElement(
            "h3",
            {
                text,

                styles: {
                    margin:
                        "0",

                    color:
                        "#eee",

                    fontSize:
                        "14px",

                    fontWeight:
                        "700",
                },
            }
        );
    }

    function createNumberSetting(
        label,
        key,
        options = {}
    ) {
        const wrapper =
            createElement(
                "label",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "5px",
                    },
                }
            );

        const labelElement =
            createElement(
                "span",
                {
                    text:
                        label,

                    styles: {
                        color:
                            "#bbb",

                        fontSize:
                            "12px",

                        fontWeight:
                            "600",
                    },
                }
            );

        const input =
            createElement(
                "input",
                {
                    attributes: {
                        type:
                            "number",

                        min:
                            String(
                                options.minimum ??
                                0
                            ),

                        max:
                            String(
                                options.maximum ??
                                100000000000
                            ),

                        step:
                            "1",

                        value:
                            settings.get(
                                key
                            ),
                    },

                    styles: {
                        boxSizing:
                            "border-box",

                        width:
                            "100%",

                        padding:
                            "9px 10px",

                        border:
                            "1px solid rgba(255,255,255,.16)",

                        borderRadius:
                            "5px",

                        background:
                            "#202020",

                        color:
                            "#fff",
                    },
                }
            );

        input.addEventListener(
            "change",
            () => {
                const value =
                    Number(
                        input.value
                    );

                try {
                    settings.set(
                        key,
                        value,
                        {
                            source:
                                "protection-ui",
                        }
                    );
                } catch (error) {
                    notifications?.warning?.(
                        error.message,
                        {
                            title:
                                "Invalid Protection Setting",

                            group:
                                "protection",
                        }
                    );

                    input.value =
                        String(
                            settings.get(
                                key
                            )
                        );
                }
            }
        );

        wrapper.append(
            labelElement,
            input
        );

        return wrapper;
    }

    function createDestinationSetting() {
        const wrapper =
            createElement(
                "label",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "5px",
                    },
                }
            );

        const label =
            createElement(
                "span",
                {
                    text:
                        "Deposit Destination",

                    styles: {
                        color:
                            "#bbb",

                        fontSize:
                            "12px",

                        fontWeight:
                            "600",
                    },
                }
            );

        const select =
            createElement(
                "select",
                {
                    styles: {
                        boxSizing:
                            "border-box",

                        width:
                            "100%",

                        padding:
                            "9px 10px",

                        border:
                            "1px solid rgba(255,255,255,.16)",

                        borderRadius:
                            "5px",

                        background:
                            "#202020",

                        color:
                            "#fff",
                    },
                }
            );

        const selectedDestination =
            settings.get(
                "depositDestination"
            );

        for (
            const destination of
            getDestinations()
        ) {
            const option =
                createElement(
                    "option",
                    {
                        text:
                            destination.verified &&
                            destination.fillSupported
                                ? destination.name
                                : `${destination.name} — Not Yet Mapped`,

                        attributes: {
                            value:
                                destination.id,
                        },
                    }
                );

            option.selected =
                destination.id ===
                selectedDestination;

            select.appendChild(
                option
            );
        }

        select.addEventListener(
            "change",
            () => {
                try {
                    settings.set(
                        "depositDestination",
                        select.value,
                        {
                            source:
                                "protection-ui",
                        }
                    );
                } catch (error) {
                    notifications?.warning?.(
                        error.message,
                        {
                            title:
                                "Invalid Deposit Destination",

                            group:
                                "protection",
                        }
                    );

                    select.value =
                        settings.get(
                            "depositDestination"
                        );
                }
            }
        );

        wrapper.append(
            label,
            select
        );

        return wrapper;
    }

    function getStatusDisplay(
        evaluation
    ) {
        if (
            preparationInProgress
        ) {
            return {
                text:
                    "Preparing deposit",

                background:
                    "rgba(75,145,230,.16)",
            };
        }

        if (
            evaluation.shouldDeposit
        ) {
            return {
                text:
                    "Deposit recommended",

                background:
                    "rgba(245,166,35,.14)",
            };
        }

        if (
            evaluation.reason ===
            "protection-disabled"
        ) {
            return {
                text:
                    "Protection disabled",

                background:
                    "rgba(255,255,255,.055)",
            };
        }

        return {
            text:
                formatReason(
                    evaluation.reason
                ),

            background:
                "rgba(67,160,71,.13)",
        };
    }

    async function prepareDeposit() {
        const evaluation =
            evaluate();

        if (
            preparationInProgress
        ) {
            return {
                state:
                    "duplicate",

                reason:
                    "preparation-already-running",
            };
        }

        if (
            !evaluation.shouldDeposit
        ) {
            notifications?.warning?.(
                "There is currently no recommended deposit to prepare.",
                {
                    title:
                        "Protection",

                    group:
                        "protection",
                }
            );

            return {
                state:
                    "not-required",

                evaluation:
                    cloneValue(
                        evaluation
                    ),
            };
        }

        const destination =
            getDestination(
                evaluation.destination
            );

        if (
            !destination ||
            !destination.verified ||
            !destination.fillSupported
        ) {
            notifications?.warning?.(
                destination
                    ? `${destination.name} has not been mapped for deposit preparation yet.`
                    : "The selected deposit destination is unavailable.",
                {
                    title:
                        "Destination Unavailable",

                    group:
                        "protection",
                }
            );

            return {
                state:
                    "destination-unavailable",

                destination:
                    evaluation.destination,
            };
        }

        if (
            !capabilities?.can(
                "deposit.prepare"
            )
        ) {
            notifications?.warning?.(
                "Deposit preparation is not authorized in this build.",
                {
                    title:
                        "Capability Unavailable",

                    group:
                        "protection",
                }
            );

            return {
                state:
                    "capability-denied",
            };
        }

        preparationInProgress =
            true;

        metrics.preparationRequests +=
            1;

        metrics.lastPreparationAt =
            Date.now();

        metrics.lastError =
            null;

        await refreshIfActive();

        try {
            const actionResult =
                await actions.execute(
                    ACTION_ID,
                    {
                        destination:
                            evaluation.destination,

                        amount:
                            evaluation.depositAmount,

                        notify:
                            getConfiguration()
                                .notifyOnPrepared,

                        highlightSubmit:
                            true,
                    },
                    {
                        source:
                            "protection",

                        duplicateKey:
                            `protection:${evaluation.destination}`,

                        metadata: {
                            module:
                                MODULE_ID,

                            wallet:
                                evaluation
                                    .wallet
                                    .value,

                            reserve:
                                evaluation
                                    .configuration
                                    .reserve,

                            threshold:
                                evaluation
                                    .configuration
                                    .threshold,
                        },
                    }
                );

            latestActionResult =
                actionResult;

            metrics.lastActionState =
                actionResult.state;

            metrics.lastActionReason =
                actionResult.result
                    ?.reason ||
                actionResult.error
                    ?.message ||
                null;

            if (
                actionResult.state ===
                actions.states.COMPLETED
            ) {
                metrics.preparationsCompleted +=
                    1;

                const result =
                    actionResult.result;

                if (
                    result?.navigationStarted
                ) {
                    notifications?.info?.(
                        `${destination.name} is opening. The recommended amount will be filled after the page loads.`,
                        {
                            title:
                                "Preparing Deposit",

                            group:
                                "protection",
                        }
                    );
                } else if (
                    result?.success ===
                    false
                ) {
                    notifications?.warning?.(
                        result.message ||
                        "The deposit could not be prepared.",
                        {
                            title:
                                "Deposit Not Prepared",

                            group:
                                "protection",
                        }
                    );
                }
            } else if (
                actionResult.state ===
                actions.states.DUPLICATE
            ) {
                notifications?.info?.(
                    "A deposit preparation is already in progress.",
                    {
                        title:
                            "Protection",

                        group:
                            "protection",
                    }
                );
            } else {
                metrics.preparationsFailed +=
                    1;

                notifications?.warning?.(
                    actionResult.error
                        ?.message ||
                    "The deposit preparation action did not complete.",
                    {
                        title:
                            "Protection Error",

                        group:
                            "protection",
                    }
                );
            }

            return actionResult;
        } catch (error) {
            metrics.preparationsFailed +=
                1;

            metrics.lastError = {
                name:
                    error?.name ||
                    "Error",

                message:
                    error?.message ||
                    String(error),

                timestamp:
                    Date.now(),
            };

            logger?.error(
                "Protection deposit preparation failed",
                {
                    error,

                    evaluation:
                        cloneValue(
                            evaluation
                        ),
                }
            );

            notifications?.warning?.(
                error?.message ||
                "Protection could not prepare the deposit.",
                {
                    title:
                        "Protection Error",

                    group:
                        "protection",
                }
            );

            return {
                state:
                    "failed",

                error:
                    metrics.lastError,
            };
        } finally {
            preparationInProgress =
                false;

            await refreshIfActive();
        }
    }

    function render(
        container
    ) {
        metrics.renders +=
            1;

        const evaluation =
            evaluate();

        const configuration =
            getConfiguration();

        const destination =
            getDestination(
                evaluation.destination
            );

        const statusDisplay =
            getStatusDisplay(
                evaluation
            );

        const destinationSupported =
            Boolean(
                destination &&
                destination.verified &&
                destination.fillSupported
            );

        const preparationAuthorized =
            capabilities?.can(
                "deposit.prepare"
            ) === true;

        const prepareDisabled =
            preparationInProgress ||
            !evaluation.shouldDeposit ||
            !destinationSupported ||
            !preparationAuthorized;

        container.replaceChildren();

        const heading =
            createElement(
                "h2",
                {
                    text:
                        "🛡 Wallet Protection",

                    className:
                        "tactic-page-heading",

                    styles: {
                        margin:
                            "0",
                    },
                }
            );

        const description =
            createElement(
                "p",
                {
                    text:
                        "Monitors your wallet, calculates a recommended deposit, opens the selected destination, and fills the amount. You remain responsible for reviewing and submitting the deposit.",

                    styles: {
                        margin:
                            "8px 0 12px",

                        color:
                            "#aaa",

                        fontSize:
                            "12px",

                        lineHeight:
                            "1.45",
                    },
                }
            );

        const status =
            createElement(
                "div",
                {
                    text:
                        statusDisplay.text,

                    styles: {
                        margin:
                            "12px 0",

                        padding:
                            "10px 12px",

                        border:
                            "1px solid rgba(255,255,255,.08)",

                        borderRadius:
                            "6px",

                        background:
                            statusDisplay
                                .background,

                        color:
                            "#eee",

                        fontWeight:
                            "700",
                    },
                }
            );

        const grid =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0,1fr))",

                        gap:
                            "8px",
                    },
                }
            );

        grid.append(
            createCard(
                "Wallet",
                evaluation
                    .wallet
                    .available
                    ? formatMoney(
                          evaluation
                              .wallet
                              .value
                      )
                    : "Unknown"
            ),

            createCard(
                "Keep in Wallet",
                formatMoney(
                    evaluation
                        .configuration
                        .reserve
                )
            ),

            createCard(
                "Recommended Deposit",
                formatMoney(
                    evaluation
                        .depositAmount
                )
            ),

            createCard(
                "After Deposit",
                formatMoney(
                    evaluation
                        .remainingWallet
                )
            ),

            createCard(
                "Destination",
                destination
                    ?.name ||
                evaluation
                    .destination,
                {
                    large:
                        false,
                }
            ),

            createCard(
                "Destination Status",
                destinationSupported
                    ? "Ready"
                    : "Not Yet Mapped",
                {
                    large:
                        false,

                    color:
                        destinationSupported
                            ? "#a5d6a7"
                            : "#ffcc80",
                }
            ),

            createCard(
                "Maximum Prepared",
                formatMoney(
                    evaluation
                        .configuration
                        .maximumAutomaticDeposit
                )
            ),

            createCard(
                "Protection",
                configuration.enabled
                    ? "Enabled"
                    : "Disabled"
            )
        );

        const controls =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "8px",

                        marginTop:
                            "14px",
                    },
                }
            );

        const prepareButton =
            createButton(
                preparationInProgress
                    ? "Preparing Deposit…"
                    : "Prepare Recommended Deposit",
                prepareDeposit,
                {
                    primary:
                        true,

                    disabled:
                        prepareDisabled,
                }
            );

        const protectionButton =
            createButton(
                configuration.enabled
                    ? "Disable Protection"
                    : "Enable Protection",
                () => {
                    const enabled =
                        !settings.get(
                            "enabled"
                        );

                    settings.set(
                        "enabled",
                        enabled,
                        {
                            source:
                                "protection-ui",
                        }
                    );

                    notifications?.info?.(
                        enabled
                            ? "Wallet Protection enabled."
                            : "Wallet Protection disabled.",
                        {
                            title:
                                "Protection",

                            group:
                                "protection",
                        }
                    );
                }
            );

        const refreshButton =
            createButton(
                "Refresh Wallet",
                () => {
                    latestWallet =
                        userRepository
                            .refreshWallet(
                                "protection-ui"
                            );

                    evaluate();
                    refreshIfActive();
                }
            );

        controls.append(
            prepareButton,
            protectionButton
        );

        /*
         * Only the authenticated developer account sees this
         * control. Regular users retain the existing dashboard.
         */
        if (
            developer?.isDeveloper?.() ===
            true
        ) {
            const autoDepositState =
                developer.getFeatureState(
                    AUTO_DEPOSIT_FEATURE_ID
                );

            const autoDepositButton =
                createButton(
                    autoDepositState
                        .storedEnabled
                        ? "Disable Auto Deposit"
                        : "Enable Auto Deposit",
                    async () => {
                        const result =
                            developer.toggleFeature(
                                AUTO_DEPOSIT_FEATURE_ID,
                                {
                                    source:
                                        "protection-ui",
                                }
                            );

                        if (!result.success) {
                            notifications?.warning?.(
                                "TACTIC could not change the Auto Deposit setting.",
                                {
                                    title:
                                        "Developer Auto Deposit",

                                    group:
                                        "protection",
                                }
                            );

                            return;
                        }

                        notifications?.info?.(
                            result.enabled
                                ? "Developer Auto Deposit enabled."
                                : "Developer Auto Deposit disabled.",
                            {
                                title:
                                    "Developer Auto Deposit",

                                group:
                                    "protection",
                            }
                        );

                        await refreshIfActive();
                    },
                    {
                        primary:
                            autoDepositState
                                .usable,
                    }
                );

            controls.appendChild(
                autoDepositButton
            );
        }

        controls.appendChild(
            refreshButton
        );

        const safetyNotice =
            createElement(
                "div",
                {
                    text:
                        "TACTIC will not click the deposit or confirmation controls. Review the prepared amount and submit it yourself.",

                    styles: {
                        marginTop:
                            "12px",

                        padding:
                            "10px 12px",

                        border:
                            "1px solid rgba(245,166,35,.25)",

                        borderRadius:
                            "6px",

                        background:
                            "rgba(245,166,35,.07)",

                        color:
                            "#ddd",

                        fontSize:
                            "11px",

                        lineHeight:
                            "1.45",
                    },
                }
            );

        const settingsSection =
            createElement(
                "section",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "10px",

                        marginTop:
                            "18px",
                    },
                }
            );

        settingsSection.append(
            createSectionHeading(
                "Protection Settings"
            ),

            createDestinationSetting(),

            createNumberSetting(
                "Activation Threshold",
                "threshold"
            ),

            createNumberSetting(
                "Keep in Wallet",
                "reserve"
            ),

            createNumberSetting(
                "Maximum Prepared Amount",
                "maximumAutomaticDeposit",
                {
                    minimum:
                        1,

                    maximum:
                        1000000000,
                }
            )
        );

        container.append(
            heading,
            description,
            status,
            grid,
            controls,
            safetyNotice,
            settingsSection
        );
    }

    function inspect() {
        return {
            module:
                MODULE_ID,

            dependencySource:
                "TACTIC.use",

            dependencies: {
                actions:
                    Boolean(actions),

                capabilities:
                    Boolean(capabilities),

                deposit:
                    Boolean(deposit),

                drawer:
                    Boolean(drawer),

                logger:
                    Boolean(logger),

                events:
                    Boolean(events),

                notifications:
                    Boolean(notifications),

                health:
                    Boolean(health),

                user:
                    Boolean(userRepository),

                protection:
                    Boolean(protection),

                developer:
                    Boolean(developer),
            },

            initialized:
                metrics.initializedAt !==
                null,

            preparationInProgress,

            wallet:
                cloneValue(
                    latestWallet
                ),

            evaluation:
                cloneValue(
                    latestEvaluation
                ),

            configuration:
                getConfiguration(),

            developerAutoDeposit:
                developer
                    ?.getFeatureState?.(
                        AUTO_DEPOSIT_FEATURE_ID
                    ) ||
                null,

            latestActionResult:
                cloneValue(
                    latestActionResult
                ),

            destinations:
                getDestinations(),

            action: {
                id:
                    ACTION_ID,

                registered:
                    actions.has(
                        ACTION_ID
                    ),

                authorized:
                    capabilities?.can(
                        "deposit.prepare"
                    ) === true,

                definition:
                    actions.get(
                        ACTION_ID
                    ),
            },

            metrics: {
                ...metrics,

                lastError:
                    metrics.lastError
                        ? {
                              ...metrics
                                  .lastError,
                          }
                        : null,
            },
        };
    }

    TACTIC.protection.prepareDeposit =
        prepareDeposit;

    TACTIC.protection.inspect =
        inspect;

    TACTIC.registerModule({
        id:
            MODULE_ID,

        name:
            "Protection",

        icon:
            "🛡",

        version:
            "1.2.0",

        order:
            100,

        async init() {
            metrics.initializedAt =
                Date.now();

            unsubscribeWallet =
                userRepository.subscribe(
                    "wallet",
                    ({
                        value,
                    }) => {
                        latestWallet =
                            value;

                        metrics.walletUpdates +=
                            1;

                        metrics.lastWalletUpdateAt =
                            Date.now();

                        evaluate();
                        refreshIfActive();
                    },
                    {
                        emitInitial:
                            true,
                    }
                );

            removeSettingsListener =
                events.on(
                    TACTIC.EVENTS
                        .SETTINGS
                        .CHANGED,
                    ({
                        namespace,
                    }) => {
                        if (
                            namespace !==
                            "protection"
                        ) {
                            return;
                        }

                        metrics.settingsChanges +=
                            1;

                        evaluate();
                        refreshIfActive();
                    }
                );

            removeDeveloperListeners.push(
                events.on(
                    "developer:feature-changed",
                    ({
                        featureId,
                    }) => {
                        if (
                            featureId !==
                            AUTO_DEPOSIT_FEATURE_ID
                        ) {
                            return;
                        }

                        refreshIfActive();
                    }
                )
            );

            removeDeveloperListeners.push(
                events.on(
                    "developer:changed",
                    () => {
                        refreshIfActive();
                    }
                )
            );

            removeDeveloperListeners.push(
                events.on(
                    "developer:identity-changed",
                    () => {
                        refreshIfActive();
                    }
                )
            );

            health?.register({
                name:
                    "module:protection",

                type:
                    health.types.MODULE,

                status:
                    TACTIC
                        .HEALTH_STATES
                        .HEALTHY,

                staleAfterMs:
                    null,

                metadata: {
                    moduleId:
                        MODULE_ID,

                    actionId:
                        ACTION_ID,

                    publicPreparation:
                        true,

                    automaticSubmission:
                        false,

                    automaticConfirmation:
                        false,

                    requiresHeartbeat:
                        false,
                },
            });

            logger?.info(
                "Protection module initialized",
                {
                    action:
                        ACTION_ID,

                    automaticSubmission:
                        false,
                }
            );
        },

        render(
            container
        ) {
            render(
                container
            );
        },

        destroy() {
            if (
                typeof unsubscribeWallet ===
                "function"
            ) {
                unsubscribeWallet();

                unsubscribeWallet =
                    null;
            }

            if (
                typeof removeSettingsListener ===
                "function"
            ) {
                removeSettingsListener();

                removeSettingsListener =
                    null;
            }

            while (
                removeDeveloperListeners
                    .length > 0
            ) {
                const removeListener =
                    removeDeveloperListeners
                        .pop();

                if (
                    typeof removeListener ===
                    "function"
                ) {
                    removeListener();
                }
            }

            logger?.info(
                "Protection module destroyed"
            );
        },
    });
})();