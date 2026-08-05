/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/pages/index.js
 *
 * Purpose:
 * Provides a centralized registry for Torn page objects.
 *
 * Responsibilities:
 * - Register named page-object definitions
 * - Resolve page objects by stable ID
 * - Expose page readiness and diagnostics
 * - Give actions and services a selector-independent API
 * - Enforce read-only snapshots of registered definitions
 *
 * Does NOT:
 * - Decide when navigation should occur
 * - Automatically perform gameplay actions
 * - Submit forms
 * - Confirm transactions
 * - Persist page-object instances across reloads
 *
 * Public API:
 * - register()
 * - unregister()
 * - has()
 * - get()
 * - list()
 * - isReady()
 * - waitUntilReady()
 * - inspect()
 *
 * Dependencies:
 * - services/dom/index.js
 * - services/selectors/index.js
 * - services/navigation/index.js
 * - core/logger.js
 * - core/errors.js
 * - core/health.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Pages] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        dom,
        selectors,
        navigation,
        logger,
        health,
    } = services;

    const {
        HEALTH_STATES,
    } = constants;

    if (!dom) {
        console.error(
            "[TACTIC Pages] DOM service is unavailable."
        );

        return;
    }

    if (!selectors) {
        console.error(
            "[TACTIC Pages] Selector Registry is unavailable."
        );

        return;
    }

    const SERVICE_NAME =
        "service:pages";

    const DEFAULT_READY_TIMEOUT_MS =
        15_000;

    const registry =
        new Map();

    const metrics = {
        startedAt:
            Date.now(),

        registrations:
            0,

        replacements:
            0,

        unregistrations:
            0,

        gets:
            0,

        readinessChecks:
            0,

        readinessPasses:
            0,

        readinessFailures:
            0,

        waits:
            0,

        waitTimeouts:
            0,

        lastActivityAt:
            Date.now(),

        lastPageId:
            null,

        lastOperation:
            null,

        lastReady:
            null,

        lastError:
            null,
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
        value
    ) {
        if (
            typeof value !==
                "string" ||
            !value.trim()
        ) {
            throw new TypeError(
                "Page-object ID must be a non-empty string."
            );
        }

        const normalized =
            value
                .trim()
                .toLowerCase();

        if (
            !/^[a-z0-9._:-]+$/
                .test(normalized)
        ) {
            throw new TypeError(
                "Page-object ID contains unsupported characters."
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
                "Page-object definition must be an object."
            );
        }

        const id =
            normalizeId(
                definition.id ||
                definition.name
            );

        if (
            typeof definition.create !==
                "function"
        ) {
            throw new TypeError(
                `Page object "${id}" requires a create() function.`
            );
        }

        return {
            id,

            name:
                typeof definition.name ===
                    "string" &&
                definition.name.trim()
                    ? definition.name.trim()
                    : id,

            description:
                typeof definition
                    .description ===
                    "string"
                    ? definition
                          .description
                          .trim()
                    : "",

            navigationId:
                typeof definition
                    .navigationId ===
                    "string" &&
                definition.navigationId.trim()
                    ? definition
                          .navigationId
                          .trim()
                    : null,

            rootSelectorKey:
                typeof definition
                    .rootSelectorKey ===
                    "string" &&
                definition.rootSelectorKey
                    .trim()
                    ? definition
                          .rootSelectorKey
                          .trim()
                          .toUpperCase()
                    : null,

            requiredSelectorKeys:
                Array.isArray(
                    definition
                        .requiredSelectorKeys
                )
                    ? definition
                          .requiredSelectorKeys
                          .filter(
                              (key) =>
                                  typeof key ===
                                      "string" &&
                                  key.trim()
                          )
                          .map(
                              (key) =>
                                  key
                                      .trim()
                                      .toUpperCase()
                          )
                    : [],

            create:
                definition.create,

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

    function createDefinitionSnapshot(
        definition
    ) {
        if (!definition) {
            return null;
        }

        return {
            id:
                definition.id,

            name:
                definition.name,

            description:
                definition.description,

            navigationId:
                definition.navigationId,

            rootSelectorKey:
                definition.rootSelectorKey,

            requiredSelectorKeys: [
                ...definition
                    .requiredSelectorKeys,
            ],

            metadata: {
                ...definition.metadata,
            },

            registeredAt:
                definition.registeredAt,
        };
    }

    function recordActivity(
        operation,
        pageId = null,
        metadata = {}
    ) {
        metrics.lastActivityAt =
            Date.now();

        metrics.lastOperation =
            operation;

        metrics.lastPageId =
            pageId;

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    lastPageId:
                        pageId,

                    pageObjectCount:
                        registry.size,

                    ...metadata,
                },
            }
        );
    }

    function register(
        definition,
        options = {}
    ) {
        const normalized =
            normalizeDefinition(
                definition
            );

        const exists =
            registry.has(
                normalized.id
            );

        if (
            exists &&
            options.replace !==
                true
        ) {
            throw new Error(
                `Page object "${normalized.id}" is already registered.`
            );
        }

        registry.set(
            normalized.id,
            normalized
        );

        if (exists) {
            metrics.replacements +=
                1;
        } else {
            metrics.registrations +=
                1;
        }

        recordActivity(
            exists
                ? "replace"
                : "register",
            normalized.id
        );

        logger?.debug(
            `Page object registered: ${normalized.id}`
        );

        return createDefinitionSnapshot(
            normalized
        );
    }

    function unregister(
        pageId
    ) {
        const id =
            normalizeId(
                pageId
            );

        const removed =
            registry.delete(
                id
            );

        if (removed) {
            metrics.unregistrations +=
                1;

            recordActivity(
                "unregister",
                id
            );
        }

        return removed;
    }

    function has(
        pageId
    ) {
        try {
            return registry.has(
                normalizeId(
                    pageId
                )
            );
        } catch {
            return false;
        }
    }

    function getDefinition(
        pageId
    ) {
        const id =
            normalizeId(
                pageId
            );

        return (
            registry.get(
                id
            ) ||
            null
        );
    }

    function createContext(
        definition
    ) {
        return {
            page:
                createDefinitionSnapshot(
                    definition
                ),

            services:
                TACTIC.services,

            repositories:
                TACTIC.repositories,

            modules:
                TACTIC.modules,

            dom,
            selectors,
            navigation,
        };
    }

    function get(
        pageId
    ) {
        metrics.gets +=
            1;

        const definition =
            getDefinition(
                pageId
            );

        if (!definition) {
            return null;
        }

        try {
            const instance =
                definition.create(
                    createContext(
                        definition
                    )
                );

            recordActivity(
                "get",
                definition.id
            );

            return instance;
        } catch (error) {
            metrics.lastError = {
                name:
                    error?.name ||
                    "Error",

                message:
                    error?.message ||
                    String(error),

                pageId:
                    definition.id,

                timestamp:
                    Date.now(),
            };

            logger?.error(
                `Page object creation failed: ${definition.id}`,
                {
                    error,
                }
            );

            return null;
        }
    }

    function list() {
        return [
            ...registry.values(),
        ]
            .map(
                createDefinitionSnapshot
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    first.id.localeCompare(
                        second.id
                    )
            );
    }

    function checkSelectorKey(
        selectorKey,
        options = {}
    ) {
        const result =
            selectors.resolve(
                selectorKey,
                options
            );

        return {
            key:
                selectorKey,

            found:
                result.found,

            selector:
                result.selector,

            source:
                result.source,

            fallbackIndex:
                result.fallbackIndex,
        };
    }

    function isReady(
        pageId,
        options = {}
    ) {
        metrics.readinessChecks +=
            1;

        const definition =
            getDefinition(
                pageId
            );

        if (!definition) {
            metrics.readinessFailures +=
                1;

            return {
                pageId:
                    String(pageId),

                ready:
                    false,

                reason:
                    "page-object-not-registered",

                checks:
                    [],
            };
        }

        const selectorKeys =
            [
                definition
                    .rootSelectorKey,

                ...definition
                    .requiredSelectorKeys,
            ].filter(
                Boolean
            );

        const checks =
            selectorKeys.map(
                (selectorKey) =>
                    checkSelectorKey(
                        selectorKey,
                        options
                    )
            );

        const ready =
            checks.every(
                (check) =>
                    check.found
            );

        metrics.lastReady =
            ready;

        if (ready) {
            metrics.readinessPasses +=
                1;
        } else {
            metrics.readinessFailures +=
                1;
        }

        recordActivity(
            "readiness-check",
            definition.id,
            {
                ready,

                failedSelectors:
                    checks
                        .filter(
                            (check) =>
                                !check.found
                        )
                        .map(
                            (check) =>
                                check.key
                        ),
            }
        );

        return {
            pageId:
                definition.id,

            ready,

            reason:
                ready
                    ? "ready"
                    : "required-selector-missing",

            checks,

            checkedAt:
                Date.now(),
        };
    }

    function delay(
        milliseconds
    ) {
        return new Promise(
            (resolve) => {
                setTimeout(
                    resolve,
                    milliseconds
                );
            }
        );
    }

    async function waitUntilReady(
        pageId,
        options = {}
    ) {
        metrics.waits +=
            1;

        const timeoutMs =
            Number.isSafeInteger(
                options.timeoutMs
            ) &&
            options.timeoutMs > 0
                ? options.timeoutMs
                : DEFAULT_READY_TIMEOUT_MS;

        const pollIntervalMs =
            Number.isSafeInteger(
                options.pollIntervalMs
            ) &&
            options.pollIntervalMs > 0
                ? options.pollIntervalMs
                : 100;

        const startedAt =
            Date.now();

        while (
            Date.now() -
                startedAt <
            timeoutMs
        ) {
            const readiness =
                isReady(
                    pageId,
                    options
                );

            if (readiness.ready) {
                return {
                    ...readiness,

                    waitedMs:
                        Date.now() -
                        startedAt,
                };
            }

            await delay(
                pollIntervalMs
            );
        }

        metrics.waitTimeouts +=
            1;

        const readiness =
            isReady(
                pageId,
                options
            );

        const result = {
            ...readiness,

            ready:
                false,

            reason:
                "timeout",

            waitedMs:
                Date.now() -
                startedAt,
        };

        recordActivity(
            "readiness-timeout",
            result.pageId
        );

        if (
            options.rejectOnTimeout ===
            true
        ) {
            const error =
                new Error(
                    `Timed out waiting for page object "${String(pageId)}".`
                );

            error.name =
                "PageObjectTimeoutError";

            throw error;
        }

        return result;
    }

    function inspect() {
        return {
            service:
                "pages",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            pageObjectCount:
                registry.size,

            pageObjects:
                list(),

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

            defaults: {
                readyTimeoutMs:
                    DEFAULT_READY_TIMEOUT_MS,
            },
        };
    }

    TACTIC.services.pages =
        Object.freeze({
            register,
            unregister,

            has,
            get,
            list,

            isReady,
            waitUntilReady,

            inspect,
        });

    health?.register({
        name:
            SERVICE_NAME,

        type:
            health.types.SERVICE,

        status:
            HEALTH_STATES.HEALTHY,

        staleAfterMs:
            null,

        metadata: {
            serviceName:
                "pages",

            pageObjectCount:
                0,

            readOnlyRegistry:
                true,

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Page Object service loaded"
    );
})();