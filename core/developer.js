(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Developer] Namespace is unavailable."
        );

        return;
    }

    const storage =
        TACTIC.services.storage;

    const events =
        TACTIC.services.events;

    const logger =
        TACTIC.services.logger;

    if (!storage) {
        console.error(
            "[TACTIC Developer] Storage service is unavailable."
        );

        return;
    }

    if (!events) {
        console.error(
            "[TACTIC Developer] Event service is unavailable."
        );

        return;
    }

    /*
     * ============================================================
     * Developer identity
     * ============================================================
     */

    const DEVELOPER_USER_ID =
        2243600;

    const MASTER_STORAGE_KEY =
        "developer:enabled";

    const FEATURE_STORAGE_PREFIX =
        "developer:feature:";

    const IDENTITY_CHECK_INTERVAL_MS =
        2_000;

    /*
     * Every developer-only feature should be defined here.
     *
     * Automatic or transactional features should default to false.
     */
    const FEATURES =
        Object.freeze({
            PROTECTION_AUTO_DEPOSIT:
                "protection.autoDeposit",

            DEVELOPER_DASHBOARD:
                "developer.dashboard",

            LIVE_REFRESH:
                "developer.liveRefresh",

            EXTENDED_DIAGNOSTICS:
                "developer.extendedDiagnostics",
        });

    const FEATURE_DEFAULTS =
        Object.freeze({
            [FEATURES.PROTECTION_AUTO_DEPOSIT]:
                false,

            [FEATURES.DEVELOPER_DASHBOARD]:
                true,

            [FEATURES.LIVE_REFRESH]:
                false,

            [FEATURES.EXTENDED_DIAGNOSTICS]:
                true,
        });

    /*
     * ============================================================
     * Runtime state
     * ============================================================
     */

    const identity = {
        currentUserId:
            null,

        resolved:
            false,

        isDeveloper:
            false,

        source:
            null,

        resolvedAt:
            null,

        lastCheckedAt:
            null,

        checks:
            0,

        changes:
            0,
    };

    const metrics = {
        startedAt:
            Date.now(),

        emittedEvents:
            0,

        createdLogs:
            0,

        moduleRegistrations:
            0,

        moduleInitializations:
            0,

        moduleErrors:
            0,

        featureReads:
            0,

        featureWrites:
            0,

        deniedFeatureWrites:
            0,

        identityChanges:
            0,

        lastEvent:
            null,

        lastLog:
            null,

        lastModuleEvent:
            null,

        lastFeatureChange:
            null,
    };

    const subscribers =
        new Set();

    let identityIntervalId =
        null;

    let identityObserver =
        null;

    /*
     * ============================================================
     * General helpers
     * ============================================================
     */

    function normalizeUserId(
        value
    ) {
        const numeric =
            Number(value);

        if (
            !Number.isSafeInteger(
                numeric
            ) ||
            numeric <= 0
        ) {
            return null;
        }

        return numeric;
    }

    function normalizeFeatureId(
        featureId
    ) {
        if (
            typeof featureId !==
                "string" ||
            !featureId.trim()
        ) {
            throw new TypeError(
                "Developer feature ID must be a non-empty string."
            );
        }

        return featureId.trim();
    }

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
                return {
                    ...value,
                };
            }
        }

        return value;
    }

    function incrementMetric(
        key,
        amount = 1
    ) {
        if (
            typeof metrics[key] !==
            "number"
        ) {
            return;
        }

        metrics[key] +=
            amount;
    }

    /*
     * ============================================================
     * Identity resolution
     * ============================================================
     */

    function parseUserIdFromText(
        text
    ) {
        const match =
            String(
                text ||
                ""
            ).match(
                /\[(\d+)\]/
            );

        return normalizeUserId(
            match?.[1]
        );
    }

    function parseUserIdFromHref(
        href
    ) {
        if (
            typeof href !==
                "string" ||
            !href
        ) {
            return null;
        }

        try {
            const url =
                new URL(
                    href,
                    globalThis.location
                        .origin
                );

            return normalizeUserId(
                url.searchParams.get(
                    "XID"
                )
            );
        } catch {
            const match =
                href.match(
                    /(?:\?|&)XID=(\d+)/i
                );

            return normalizeUserId(
                match?.[1]
            );
        }
    }

    function inspectIdentityContainer(
        container,
        source
    ) {
        if (
            !container ||
            typeof container
                .querySelectorAll !==
                "function"
        ) {
            return null;
        }

        /*
         * Limit resolution to the current player's sidebar/header.
         *
         * We must not scan the entire page because profiles and
         * faction pages contain IDs belonging to other players.
         */
        const links =
            container.querySelectorAll(
                'a[href*="profiles.php"]'
            );

        for (
            const link of
            links
        ) {
            const hrefUserId =
                parseUserIdFromHref(
                    link.href ||
                    link.getAttribute(
                        "href"
                    )
                );

            const textUserId =
                parseUserIdFromText(
                    link.textContent
                );

            /*
             * If both are present, they must agree.
             */
            if (
                hrefUserId &&
                textUserId &&
                hrefUserId !==
                    textUserId
            ) {
                continue;
            }

            const userId =
                hrefUserId ||
                textUserId;

            if (userId) {
                return {
                    userId,
                    source,
                };
            }
        }

        /*
         * Fallback for layouts that display:
         *
         * XZer0 [2243600]
         *
         * without putting the ID in the profile link.
         */
        const textUserId =
            parseUserIdFromText(
                container.textContent
            );

        if (textUserId) {
            return {
                userId:
                    textUserId,

                source:
                    `${source}:text`,
            };
        }

        return null;
    }

    function resolveIdentityFromDom() {
        identity.checks +=
            1;

        identity.lastCheckedAt =
            Date.now();

        const candidates = [
            {
                selector:
                    "#sidebar",

                source:
                    "sidebar",
            },

            {
                selector:
                    ".sidebar",

                source:
                    "sidebar-class",
            },

            {
                selector:
                    "#header-root",

                source:
                    "header-root",
            },

            {
                selector:
                    "header",

                source:
                    "header",
            },
        ];

        for (
            const candidate of
            candidates
        ) {
            const container =
                document.querySelector(
                    candidate.selector
                );

            const result =
                inspectIdentityContainer(
                    container,
                    candidate.source
                );

            if (result) {
                return result;
            }
        }

        return null;
    }

    function getIdentitySnapshot() {
        return {
            currentUserId:
                identity.currentUserId,

            developerUserId:
                DEVELOPER_USER_ID,

            resolved:
                identity.resolved,

            isDeveloper:
                identity.isDeveloper,

            source:
                identity.source,

            resolvedAt:
                identity.resolvedAt,

            lastCheckedAt:
                identity.lastCheckedAt,

            checks:
                identity.checks,

            changes:
                identity.changes,
        };
    }

    function notifySubscribers(
        reason,
        previous = null
    ) {
        const snapshot =
            inspect();

        for (
            const callback of
            subscribers
        ) {
            try {
                callback({
                    current:
                        snapshot,

                    previous,

                    reason,

                    timestamp:
                        Date.now(),
                });
            } catch (error) {
                console.error(
                    "[TACTIC Developer] Subscriber failed.",
                    error
                );
            }
        }
    }

    function applyIdentity(
        result,
        reason =
            "identity-check"
    ) {
        const nextUserId =
            normalizeUserId(
                result?.userId
            );

        const nextResolved =
            nextUserId !==
            null;

        const nextIsDeveloper =
            nextUserId ===
            DEVELOPER_USER_ID;

        const nextSource =
            result?.source ||
            null;

        const changed =
            identity.currentUserId !==
                nextUserId ||
            identity.resolved !==
                nextResolved ||
            identity.isDeveloper !==
                nextIsDeveloper ||
            identity.source !==
                nextSource;

        if (!changed) {
            return false;
        }

        const previous =
            getIdentitySnapshot();

        identity.currentUserId =
            nextUserId;

        identity.resolved =
            nextResolved;

        identity.isDeveloper =
            nextIsDeveloper;

        identity.source =
            nextSource;

        identity.resolvedAt =
            nextResolved
                ? Date.now()
                : null;

        identity.changes +=
            1;

        metrics.identityChanges +=
            1;

        events.emit(
            "developer:identity-changed",
            {
                current:
                    getIdentitySnapshot(),

                previous,

                reason,
            }
        );

        notifySubscribers(
            "identity-changed",
            previous
        );

        logger?.info(
            nextIsDeveloper
                ? "Developer identity verified"
                : "Developer identity unavailable or unauthorized",
            {
                currentUserId:
                    nextUserId,

                developerUserId:
                    DEVELOPER_USER_ID,

                source:
                    nextSource,

                reason,
            }
        );

        return true;
    }

    function refreshIdentity(
        reason =
            "manual-refresh"
    ) {
        const result =
            resolveIdentityFromDom();

        applyIdentity(
            result,
            reason
        );

        return getIdentitySnapshot();
    }

    function isDeveloper() {
        if (!identity.resolved) {
            refreshIdentity(
                "is-developer-check"
            );
        }

        return (
            identity.resolved ===
                true &&
            identity.isDeveloper ===
                true &&
            identity.currentUserId ===
                DEVELOPER_USER_ID
        );
    }

    function startIdentityWatcher() {
        refreshIdentity(
            "startup"
        );

        if (
            identityIntervalId ===
            null
        ) {
            identityIntervalId =
                globalThis.setInterval(
                    () => {
                        refreshIdentity(
                            "interval"
                        );
                    },
                    IDENTITY_CHECK_INTERVAL_MS
                );
        }

        if (
            !identityObserver &&
            document.documentElement
        ) {
            identityObserver =
                new MutationObserver(
                    () => {
                        /*
                         * Only use mutations to help initial resolution.
                         * The interval handles later SPA navigation.
                         */
                        if (
                            !identity.resolved
                        ) {
                            refreshIdentity(
                                "dom-mutation"
                            );
                        }
                    }
                );

            identityObserver.observe(
                document.documentElement,
                {
                    childList:
                        true,

                    subtree:
                        true,
                }
            );
        }

        return true;
    }

    function stopIdentityWatcher() {
        if (
            identityIntervalId !==
            null
        ) {
            globalThis.clearInterval(
                identityIntervalId
            );

            identityIntervalId =
                null;
        }

        if (identityObserver) {
            identityObserver.disconnect();

            identityObserver =
                null;
        }

        return true;
    }

    /*
     * ============================================================
     * Master Developer Mode
     * ============================================================
     */

    function isEnabled() {
        /*
         * The stored setting cannot grant access to another user.
         */
        if (!isDeveloper()) {
            return false;
        }

        return storage.get(
            MASTER_STORAGE_KEY,
            true
        ) === true;
    }

    function setEnabled(
        enabled
    ) {
        if (!isDeveloper()) {
            logger?.warn?.(
                "Developer Mode change denied",
                {
                    currentUserId:
                        identity.currentUserId,

                    developerUserId:
                        DEVELOPER_USER_ID,
                }
            );

            return false;
        }

        const normalized =
            Boolean(
                enabled
            );

        storage.set(
            MASTER_STORAGE_KEY,
            normalized
        );

        logger?.info(
            normalized
                ? "Developer Mode enabled"
                : "Developer Mode disabled"
        );

        events.emit(
            "developer:changed",
            {
                enabled:
                    normalized,

                currentUserId:
                    identity.currentUserId,
            }
        );

        notifySubscribers(
            "master-setting-changed"
        );

        return normalized;
    }

    function toggle() {
        if (!isDeveloper()) {
            return false;
        }

        return setEnabled(
            !isEnabled()
        );
    }

    /*
     * ============================================================
     * Individual feature controls
     * ============================================================
     */

    function isKnownFeature(
        featureId
    ) {
        const normalized =
            normalizeFeatureId(
                featureId
            );

        return Object.values(
            FEATURES
        ).includes(
            normalized
        );
    }

    function getFeatureStorageKey(
        featureId
    ) {
        return (
            FEATURE_STORAGE_PREFIX +
            normalizeFeatureId(
                featureId
            )
        );
    }

    function getFeatureDefault(
        featureId
    ) {
        const normalized =
            normalizeFeatureId(
                featureId
            );

        return Boolean(
            FEATURE_DEFAULTS[
                normalized
            ]
        );
    }

    function isFeatureEnabled(
        featureId
    ) {
        incrementMetric(
            "featureReads"
        );

        const normalized =
            normalizeFeatureId(
                featureId
            );

        if (
            !isKnownFeature(
                normalized
            )
        ) {
            return false;
        }

        /*
         * Feature settings cannot bypass identity or master mode.
         */
        if (!isEnabled()) {
            return false;
        }

        return storage.get(
            getFeatureStorageKey(
                normalized
            ),
            getFeatureDefault(
                normalized
            )
        ) === true;
    }

    function canUse(
        featureId
    ) {
        return (
            isDeveloper() &&
            isEnabled() &&
            isFeatureEnabled(
                featureId
            )
        );
    }

    function setFeatureEnabled(
        featureId,
        enabled,
        options = {}
    ) {
        const normalized =
            normalizeFeatureId(
                featureId
            );

        if (
            !isKnownFeature(
                normalized
            )
        ) {
            throw new Error(
                `Unknown developer feature: ${normalized}`
            );
        }

        if (!isDeveloper()) {
            incrementMetric(
                "deniedFeatureWrites"
            );

            return {
                success:
                    false,

                changed:
                    false,

                featureId:
                    normalized,

                enabled:
                    false,

                reason:
                    "developer-access-denied",
            };
        }

        const storageKey =
            getFeatureStorageKey(
                normalized
            );

        const previousEnabled =
            storage.get(
                storageKey,
                getFeatureDefault(
                    normalized
                )
            ) === true;

        const nextEnabled =
            Boolean(
                enabled
            );

        storage.set(
            storageKey,
            nextEnabled
        );

        incrementMetric(
            "featureWrites"
        );

        metrics.lastFeatureChange = {
            featureId:
                normalized,

            previousEnabled,

            enabled:
                nextEnabled,

            source:
                options.source ||
                "developer-service",

            timestamp:
                Date.now(),
        };

        logger?.info(
            nextEnabled
                ? `Developer feature enabled: ${normalized}`
                : `Developer feature disabled: ${normalized}`,
            {
                featureId:
                    normalized,

                previousEnabled,

                enabled:
                    nextEnabled,

                source:
                    options.source ||
                    "developer-service",
            }
        );

        events.emit(
            "developer:feature-changed",
            {
                featureId:
                    normalized,

                previousEnabled,

                enabled:
                    nextEnabled,

                source:
                    options.source ||
                    "developer-service",

                currentUserId:
                    identity.currentUserId,
            }
        );

        notifySubscribers(
            "feature-setting-changed"
        );

        return {
            success:
                true,

            changed:
                previousEnabled !==
                nextEnabled,

            featureId:
                normalized,

            previousEnabled,

            enabled:
                nextEnabled,
        };
    }

    function toggleFeature(
        featureId,
        options = {}
    ) {
        const normalized =
            normalizeFeatureId(
                featureId
            );

        const storageKey =
            getFeatureStorageKey(
                normalized
            );

        const currentEnabled =
            storage.get(
                storageKey,
                getFeatureDefault(
                    normalized
                )
            ) === true;

        return setFeatureEnabled(
            normalized,
            !currentEnabled,
            options
        );
    }

    function getFeatureState(
        featureId
    ) {
        const normalized =
            normalizeFeatureId(
                featureId
            );

        const known =
            isKnownFeature(
                normalized
            );

        const storedEnabled =
            known &&
            isDeveloper()
                ? storage.get(
                      getFeatureStorageKey(
                          normalized
                      ),
                      getFeatureDefault(
                          normalized
                      )
                  ) === true
                : false;

        return {
            featureId:
                normalized,

            known,

            developer:
                isDeveloper(),

            masterEnabled:
                isEnabled(),

            storedEnabled,

            enabled:
                known
                    ? isFeatureEnabled(
                          normalized
                      )
                    : false,

            usable:
                known
                    ? canUse(
                          normalized
                      )
                    : false,

            defaultEnabled:
                known
                    ? getFeatureDefault(
                          normalized
                      )
                    : false,
        };
    }

    function listFeatures() {
        return Object.values(
            FEATURES
        ).map(
            getFeatureState
        );
    }

    /*
     * ============================================================
     * Developer diagnostics
     * ============================================================
     */

    function getMetrics() {
        const modules = [
            ...TACTIC.modules.values(),
        ];

        return {
            ...metrics,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            identity:
                getIdentitySnapshot(),

            moduleCount:
                modules.length,

            initializedModuleCount:
                modules.filter(
                    module =>
                        module.initialized
                ).length,

            failedModuleCount:
                modules.filter(
                    module =>
                        Boolean(
                            module.error
                        )
                ).length,

            logCount:
                logger
                    ?.getEntries()
                    ?.length ||
                0,

            subscriberCount:
                subscribers.size,
        };
    }

    function cloneConfig() {
        return cloneValue(
            TACTIC.config
        );
    }

    function getSnapshot() {
        return {
            app: {
                name:
                    TACTIC.name,

                fullName:
                    TACTIC.fullName,

                version:
                    TACTIC.version,

                initialized:
                    TACTIC.initialized,
            },

            identity:
                getIdentitySnapshot(),

            developerModeEnabled:
                isEnabled(),

            features:
                listFeatures(),

            modules:
                TACTIC
                    .getAllModuleStatuses
                    ? TACTIC
                          .getAllModuleStatuses()
                    : [],

            metrics:
                getMetrics(),

            config:
                cloneConfig(),
        };
    }

    function inspect() {
        return {
            service:
                "developer",

            developerUserId:
                DEVELOPER_USER_ID,

            currentUserId:
                identity.currentUserId,

            identityResolved:
                identity.resolved,

            isDeveloper:
                isDeveloper(),

            enabled:
                isEnabled(),

            identity:
                getIdentitySnapshot(),

            features:
                listFeatures(),

            metrics:
                getMetrics(),
        };
    }

    function printSnapshot() {
        const snapshot =
            getSnapshot();

        console.group(
            `[TACTIC Developer] ${TACTIC.version}`
        );

        console.log(
            "Application",
            snapshot.app
        );

        console.log(
            "Identity",
            snapshot.identity
        );

        console.log(
            "Developer Mode",
            snapshot.developerModeEnabled
        );

        console.table(
            snapshot.features.map(
                feature => ({
                    feature:
                        feature.featureId,

                    default:
                        feature.defaultEnabled,

                    stored:
                        feature.storedEnabled,

                    enabled:
                        feature.enabled,

                    usable:
                        feature.usable,
                })
            )
        );

        console.table(
            snapshot.modules.map(
                module => ({
                    id:
                        module.id,

                    name:
                        module.name,

                    version:
                        module.version,

                    initialized:
                        module.initialized,

                    error:
                        module.error,
                })
            )
        );

        console.log(
            "Metrics",
            snapshot.metrics
        );

        console.log(
            "Configuration",
            snapshot.config
        );

        console.groupEnd();

        return snapshot;
    }

    /*
     * ============================================================
     * Subscriptions
     * ============================================================
     */

    function subscribe(
        callback,
        options = {}
    ) {
        if (
            typeof callback !==
            "function"
        ) {
            throw new TypeError(
                "Developer subscriber must be a function."
            );
        }

        subscribers.add(
            callback
        );

        if (
            options.emitInitial !==
            false
        ) {
            callback({
                current:
                    inspect(),

                previous:
                    null,

                reason:
                    "subscription-initial",

                timestamp:
                    Date.now(),
            });
        }

        return () =>
            subscribers.delete(
                callback
            );
    }

    /*
     * ============================================================
     * Existing metrics listeners
     * ============================================================
     */

    events.on(
        "log:created",
        entry => {
            incrementMetric(
                "createdLogs"
            );

            metrics.lastLog =
                entry;
        }
    );

    events.on(
        "module:registered",
        payload => {
            incrementMetric(
                "moduleRegistrations"
            );

            metrics.lastModuleEvent = {
                type:
                    "registered",

                timestamp:
                    Date.now(),

                moduleId:
                    payload.module.id,
            };
        }
    );

    events.on(
        "module:initialized",
        payload => {
            incrementMetric(
                "moduleInitializations"
            );

            metrics.lastModuleEvent = {
                type:
                    "initialized",

                timestamp:
                    Date.now(),

                moduleId:
                    payload.module.id,
            };
        }
    );

    events.on(
        "module:error",
        payload => {
            incrementMetric(
                "moduleErrors"
            );

            metrics.lastModuleEvent = {
                type:
                    "error",

                timestamp:
                    Date.now(),

                moduleId:
                    payload.module?.id ||
                    null,

                message:
                    payload.error
                        ?.message ||
                    null,
            };
        }
    );

    /*
     * Wrap emit once so Developer Mode can count all emitted events.
     */
    const EMIT_TRACKING_SYMBOL =
        Symbol.for(
            "TACTIC.DEVELOPER.EMIT_TRACKING"
        );

    if (
        !events[
            EMIT_TRACKING_SYMBOL
        ]
    ) {
        const originalEmit =
            events.emit.bind(
                events
            );

        events.emit =
            function trackedEmit(
                eventName,
                payload
            ) {
                incrementMetric(
                    "emittedEvents"
                );

                metrics.lastEvent = {
                    eventName,

                    timestamp:
                        Date.now(),
                };

                return originalEmit(
                    eventName,
                    payload
                );
            };

        Object.defineProperty(
            events,
            EMIT_TRACKING_SYMBOL,
            {
                value:
                    true,

                configurable:
                    false,

                enumerable:
                    false,

                writable:
                    false,
            }
        );
    }

    /*
     * ============================================================
     * Public API
     * ============================================================
     */

    const developerService = {
        developerUserId:
            DEVELOPER_USER_ID,

        features:
            FEATURES,

        refreshIdentity,
        getIdentity:
            getIdentitySnapshot,

        isDeveloper,

        isEnabled,
        setEnabled,
        toggle,

        isKnownFeature,
        isFeatureEnabled,
        canUse,

        setFeatureEnabled,
        toggleFeature,
        getFeatureState,
        listFeatures,

        subscribe,

        startIdentityWatcher,
        stopIdentityWatcher,

        getMetrics,
        getSnapshot,
        inspect,
        printSnapshot,
    };

    TACTIC.services.developer =
        developerService;

    /*
     * Convenient alias used by modules and console testing.
     */
    TACTIC.developer =
        developerService;

    /*
     * ============================================================
     * Keyboard shortcut
     * ============================================================
     */

    document.addEventListener(
        "keydown",
        event => {
            if (
                event.ctrlKey &&
                event.shiftKey &&
                event.code ===
                    "KeyT"
            ) {
                event.preventDefault();

                if (!isEnabled()) {
                    return;
                }

                printSnapshot();
            }
        }
    );

    /*
     * ============================================================
     * Userscript menu commands
     * ============================================================
     */

    if (
        typeof GM_registerMenuCommand ===
        "function"
    ) {
        GM_registerMenuCommand(
            "Toggle TACTIC Developer Mode",
            () => {
                refreshIdentity(
                    "menu-command"
                );

                if (!isDeveloper()) {
                    alert(
                        "TACTIC Developer Mode is not available for this Torn account."
                    );

                    return;
                }

                const enabled =
                    toggle();

                alert(
                    `TACTIC Developer Mode is now ${
                        enabled
                            ? "enabled"
                            : "disabled"
                    }.`
                );
            }
        );

        GM_registerMenuCommand(
            "Print TACTIC Developer Snapshot",
            () => {
                refreshIdentity(
                    "menu-snapshot"
                );

                if (!isDeveloper()) {
                    console.warn(
                        "[TACTIC Developer] Snapshot access denied."
                    );

                    return;
                }

                printSnapshot();
            }
        );

        GM_registerMenuCommand(
            "Toggle Developer Auto Deposit",
            () => {
                refreshIdentity(
                    "menu-auto-deposit"
                );

                if (!isDeveloper()) {
                    alert(
                        "Automatic deposits are not available for this Torn account."
                    );

                    return;
                }

                const result =
                    toggleFeature(
                        FEATURES
                            .PROTECTION_AUTO_DEPOSIT,
                        {
                            source:
                                "userscript-menu",
                        }
                    );

                alert(
                    `TACTIC Auto Deposit is now ${
                        result.enabled
                            ? "enabled"
                            : "disabled"
                    }.`
                );
            }
        );
    }

    startIdentityWatcher();

    logger?.info(
        "Developer service loaded",
        {
            developerUserId:
                DEVELOPER_USER_ID,

            currentUserId:
                identity.currentUserId,

            isDeveloper:
                identity.isDeveloper,

            autoDepositDefault:
                FEATURE_DEFAULTS[
                    FEATURES
                        .PROTECTION_AUTO_DEPOSIT
                ],
        }
    );
})();