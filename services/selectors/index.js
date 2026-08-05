/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/selectors/index.js
 *
 * Purpose:
 * Provides a centralized registry for verified DOM selectors,
 * fallback selectors, selector metadata, resolution diagnostics,
 * and runtime validation.
 *
 * Responsibilities:
 * - Register named selector definitions
 * - Resolve primary and fallback selectors
 * - Find matching elements
 * - Wait for registered selectors
 * - Track fallback usage and missing selectors
 * - Validate selectors against the current document
 * - Expose diagnostics and Health information
 *
 * Does NOT:
 * - Contain application business logic
 * - Navigate between pages
 * - Click controls
 * - Replace the existing DOM selector catalog yet
 * - Guess selectors that have not been verified
 *
 * Public API:
 * - register()
 * - registerMany()
 * - unregister()
 * - has()
 * - get()
 * - list()
 * - resolve()
 * - find()
 * - findAll()
 * - exists()
 * - waitFor()
 * - validate()
 * - validateAll()
 * - inspect()
 *
 * Dependencies:
 * - services/dom/index.js
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
            "[TACTIC Selectors] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        dom,
        logger,
        errors,
        health,
    } = services;

    const {
        HEALTH_STATES,
    } = constants;

    if (!dom) {
        console.error(
            "[TACTIC Selectors] DOM service is unavailable."
        );

        return;
    }

    const SERVICE_NAME =
        "service:selectors";

    const DEFAULT_WAIT_TIMEOUT_MS =
        10_000;

    const DEFAULT_VALIDATION_TIMEOUT_MS =
        2_000;

    const registry =
        new Map();

    const runtimeState =
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

        resolutions:
            0,

        primaryResolutions:
            0,

        fallbackResolutions:
            0,

        unresolved:
            0,

        finds:
            0,

        findAllCalls:
            0,

        waits:
            0,

        waitTimeouts:
            0,

        validations:
            0,

        validationPasses:
            0,

        validationFailures:
            0,

        lastActivityAt:
            Date.now(),

        lastSelectorKey:
            null,

        lastResolvedSelector:
            null,

        lastResolutionSource:
            null,

        lastValidationAt:
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

    function normalizeKey(
        selectorKey
    ) {
        if (
            typeof selectorKey !==
                "string" ||
            !selectorKey.trim()
        ) {
            throw new TypeError(
                "Selector key must be a non-empty string."
            );
        }

        const normalized =
            selectorKey
                .trim()
                .toUpperCase();

        if (
            !/^[A-Z0-9._:-]+$/
                .test(normalized)
        ) {
            throw new TypeError(
                "Selector key contains unsupported characters."
            );
        }

        return normalized;
    }

    function normalizeSelector(
        selector,
        label =
            "Selector"
    ) {
        if (
            typeof selector !==
                "string" ||
            !selector.trim()
        ) {
            throw new TypeError(
                `${label} must be a non-empty string.`
            );
        }

        return selector.trim();
    }

    function normalizeFallbacks(
        fallbacks
    ) {
        if (
            fallbacks === null ||
            fallbacks === undefined
        ) {
            return [];
        }

        if (
            !Array.isArray(
                fallbacks
            )
        ) {
            throw new TypeError(
                "Selector fallbacks must be an array."
            );
        }

        const unique =
            new Set();

        for (
            const fallback of
            fallbacks
        ) {
            unique.add(
                normalizeSelector(
                    fallback,
                    "Fallback selector"
                )
            );
        }

        return [
            ...unique,
        ];
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
                "Selector definition must be an object."
            );
        }

        const key =
            normalizeKey(
                definition.key ||
                definition.id ||
                definition.name
            );

        const selector =
            normalizeSelector(
                definition.selector
            );

        const fallbacks =
            normalizeFallbacks(
                definition.fallbacks
            ).filter(
                (fallback) =>
                    fallback !==
                    selector
            );

        return {
            key,

            selector,

            fallbacks,

            description:
                typeof definition
                    .description ===
                    "string"
                    ? definition
                          .description
                          .trim()
                    : "",

            pageId:
                typeof definition
                    .pageId ===
                    "string" &&
                definition.pageId.trim()
                    ? definition.pageId
                          .trim()
                    : null,

            required:
                definition.required ===
                true,

            verified:
                definition.verified !==
                false,

            visible:
                definition.visible ===
                true,

            multiple:
                definition.multiple ===
                true,

            metadata:
                isPlainObject(
                    definition.metadata
                )
                    ? {
                          ...definition
                              .metadata,
                      }
                    : {},

            registeredAt:
                Date.now(),

            lastVerifiedAt:
                Number.isFinite(
                    definition
                        .lastVerifiedAt
                )
                    ? definition
                          .lastVerifiedAt
                    : null,
        };
    }

    function createRuntimeRecord(
        key
    ) {
        return {
            key,

            resolutionCount:
                0,

            primaryMatches:
                0,

            fallbackMatches:
                0,

            missingCount:
                0,

            validationCount:
                0,

            validationPasses:
                0,

            validationFailures:
                0,

            lastResolvedAt:
                null,

            lastResolvedSelector:
                null,

            lastResolutionSource:
                null,

            lastFallbackIndex:
                null,

            lastElementCount:
                0,

            lastValidatedAt:
                null,

            lastValidationPassed:
                null,

            lastError:
                null,
        };
    }

    function getRuntimeRecord(
        key
    ) {
        if (
            !runtimeState.has(
                key
            )
        ) {
            runtimeState.set(
                key,
                createRuntimeRecord(
                    key
                )
            );
        }

        return runtimeState.get(
            key
        );
    }

    function createDefinitionSnapshot(
        definition
    ) {
        if (!definition) {
            return null;
        }

        return {
            key:
                definition.key,

            selector:
                definition.selector,

            fallbacks: [
                ...definition.fallbacks,
            ],

            description:
                definition.description,

            pageId:
                definition.pageId,

            required:
                definition.required,

            verified:
                definition.verified,

            visible:
                definition.visible,

            multiple:
                definition.multiple,

            metadata: {
                ...definition.metadata,
            },

            registeredAt:
                definition.registeredAt,

            lastVerifiedAt:
                definition.lastVerifiedAt,
        };
    }

    function createRuntimeSnapshot(
        runtime
    ) {
        if (!runtime) {
            return null;
        }

        return {
            ...runtime,

            lastError:
                runtime.lastError
                    ? {
                          ...runtime
                              .lastError,
                      }
                    : null,
        };
    }

    function getDefinitionInternal(
        selectorKey
    ) {
        const key =
            normalizeKey(
                selectorKey
            );

        return (
            registry.get(
                key
            ) ||
            null
        );
    }

    function recordActivity(
        operation,
        metadata = {}
    ) {
        metrics.lastActivityAt =
            Date.now();

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    selectorCount:
                        registry.size,

                    lastSelectorKey:
                        metrics
                            .lastSelectorKey,

                    lastResolvedSelector:
                        metrics
                            .lastResolvedSelector,

                    lastResolutionSource:
                        metrics
                            .lastResolutionSource,

                    ...metadata,
                },
            }
        );
    }

    function elementIsVisible(
        element
    ) {
        if (!element) {
            return false;
        }

        const style =
            globalThis.getComputedStyle?.(
                element
            );

        return Boolean(
            element
                .getClientRects()
                .length &&
            style?.display !==
                "none" &&
            style?.visibility !==
                "hidden"
        );
    }

    function safelyQuery(
        selector,
        root =
            document
    ) {
        try {
            return root.querySelector(
                selector
            );
        } catch (error) {
            return {
                selectorError:
                    error,
            };
        }
    }

    function safelyQueryAll(
        selector,
        root =
            document
    ) {
        try {
            return [
                ...root.querySelectorAll(
                    selector
                ),
            ];
        } catch (error) {
            return {
                selectorError:
                    error,
            };
        }
    }

    function createResolutionResult(
        values = {}
    ) {
        return {
            key:
                null,

            found:
                false,

            selector:
                null,

            source:
                null,

            fallbackIndex:
                null,

            element:
                null,

            count:
                0,

            error:
                null,

            timestamp:
                Date.now(),

            ...values,
        };
    }

    function register(
        definition,
        options = {}
    ) {
        const normalized =
            normalizeDefinition(
                definition
            );

        const existing =
            registry.get(
                normalized.key
            );

        if (
            existing &&
            options.replace !==
                true
        ) {
            throw new Error(
                `Selector "${normalized.key}" is already registered.`
            );
        }

        if (existing) {
            metrics.replacements +=
                1;
        } else {
            metrics.registrations +=
                1;
        }

        registry.set(
            normalized.key,
            normalized
        );

        getRuntimeRecord(
            normalized.key
        );

        metrics.lastSelectorKey =
            normalized.key;

        recordActivity(
            existing
                ? "replace"
                : "register"
        );

        return {
            definition:
                createDefinitionSnapshot(
                    normalized
                ),

            runtime:
                createRuntimeSnapshot(
                    getRuntimeRecord(
                        normalized.key
                    )
                ),
        };
    }

    function registerMany(
        definitions,
        options = {}
    ) {
        if (
            !Array.isArray(
                definitions
            )
        ) {
            throw new TypeError(
                "Selector definitions must be an array."
            );
        }

        const results =
            [];

        for (
            const definition of
            definitions
        ) {
            results.push(
                register(
                    definition,
                    options
                )
            );
        }

        return results;
    }

    function unregister(
        selectorKey
    ) {
        const key =
            normalizeKey(
                selectorKey
            );

        const removed =
            registry.delete(
                key
            );

        runtimeState.delete(
            key
        );

        if (removed) {
            metrics.unregistrations +=
                1;

            metrics.lastSelectorKey =
                key;

            recordActivity(
                "unregister"
            );
        }

        return removed;
    }

    function has(
        selectorKey
    ) {
        try {
            return registry.has(
                normalizeKey(
                    selectorKey
                )
            );
        } catch {
            return false;
        }
    }

    function get(
        selectorKey
    ) {
        const definition =
            getDefinitionInternal(
                selectorKey
            );

        if (!definition) {
            return null;
        }

        return {
            definition:
                createDefinitionSnapshot(
                    definition
                ),

            runtime:
                createRuntimeSnapshot(
                    getRuntimeRecord(
                        definition.key
                    )
                ),
        };
    }

    function list(
        filters = {}
    ) {
        let definitions = [
            ...registry.values(),
        ];

        if (
            filters.pageId
        ) {
            definitions =
                definitions.filter(
                    (definition) =>
                        definition.pageId ===
                        filters.pageId
                );
        }

        if (
            filters.required !==
            undefined
        ) {
            definitions =
                definitions.filter(
                    (definition) =>
                        definition.required ===
                        Boolean(
                            filters.required
                        )
                );
        }

        if (
            filters.verified !==
            undefined
        ) {
            definitions =
                definitions.filter(
                    (definition) =>
                        definition.verified ===
                        Boolean(
                            filters.verified
                        )
                );
        }

        return definitions
            .map(
                (definition) => ({
                    definition:
                        createDefinitionSnapshot(
                            definition
                        ),

                    runtime:
                        createRuntimeSnapshot(
                            getRuntimeRecord(
                                definition.key
                            )
                        ),
                })
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    first.definition
                        .key
                        .localeCompare(
                            second
                                .definition
                                .key
                        )
            );
    }

    function resolve(
        selectorKey,
        options = {}
    ) {
        metrics.resolutions +=
            1;

        const definition =
            getDefinitionInternal(
                selectorKey
            );

        if (!definition) {
            metrics.unresolved +=
                1;

            return createResolutionResult({
                key:
                    String(
                        selectorKey
                    ),

                error: {
                    name:
                        "SelectorNotRegisteredError",

                    message:
                        `Selector "${String(selectorKey)}" is not registered.`,
                },
            });
        }

        const runtime =
            getRuntimeRecord(
                definition.key
            );

        runtime.resolutionCount +=
            1;

        const root =
            options.root &&
            typeof options.root
                .querySelector ===
                "function"
                ? options.root
                : document;

        const requireVisible =
            options.visible ??
            definition.visible;

        const candidates = [
            {
                selector:
                    definition.selector,

                source:
                    "primary",

                fallbackIndex:
                    null,
            },

            ...definition.fallbacks.map(
                (
                    selector,
                    index
                ) => ({
                    selector,

                    source:
                        "fallback",

                    fallbackIndex:
                        index,
                })
            ),
        ];

        for (
            const candidate of
            candidates
        ) {
            const queryResult =
                safelyQuery(
                    candidate.selector,
                    root
                );

            if (
                queryResult &&
                queryResult.selectorError
            ) {
                runtime.lastError = {
                    name:
                        queryResult
                            .selectorError
                            .name,

                    message:
                        queryResult
                            .selectorError
                            .message,

                    selector:
                        candidate.selector,

                    timestamp:
                        Date.now(),
                };

                continue;
            }

            const element =
                queryResult;

            if (!element) {
                continue;
            }

            if (
                requireVisible &&
                !elementIsVisible(
                    element
                )
            ) {
                continue;
            }

            runtime.lastResolvedAt =
                Date.now();

            runtime.lastResolvedSelector =
                candidate.selector;

            runtime.lastResolutionSource =
                candidate.source;

            runtime.lastFallbackIndex =
                candidate
                    .fallbackIndex;

            runtime.lastElementCount =
                1;

            runtime.lastError =
                null;

            if (
                candidate.source ===
                "primary"
            ) {
                runtime.primaryMatches +=
                    1;

                metrics.primaryResolutions +=
                    1;
            } else {
                runtime.fallbackMatches +=
                    1;

                metrics.fallbackResolutions +=
                    1;
            }

            metrics.lastSelectorKey =
                definition.key;

            metrics.lastResolvedSelector =
                candidate.selector;

            metrics.lastResolutionSource =
                candidate.source;

            recordActivity(
                "resolve",
                {
                    fallbackIndex:
                        candidate
                            .fallbackIndex,
                }
            );

            return createResolutionResult({
                key:
                    definition.key,

                found:
                    true,

                selector:
                    candidate.selector,

                source:
                    candidate.source,

                fallbackIndex:
                    candidate
                        .fallbackIndex,

                element,

                count:
                    1,
            });
        }

        runtime.missingCount +=
            1;

        runtime.lastResolvedAt =
            Date.now();

        runtime.lastResolvedSelector =
            null;

        runtime.lastResolutionSource =
            null;

        runtime.lastFallbackIndex =
            null;

        runtime.lastElementCount =
            0;

        metrics.unresolved +=
            1;

        metrics.lastSelectorKey =
            definition.key;

        metrics.lastResolvedSelector =
            null;

        metrics.lastResolutionSource =
            null;

        recordActivity(
            "unresolved"
        );

        return createResolutionResult({
            key:
                definition.key,

            found:
                false,

            error: {
                name:
                    "SelectorNotFoundError",

                message:
                    `No registered selector matched "${definition.key}".`,
            },
        });
    }

    function find(
        selectorKey,
        options = {}
    ) {
        metrics.finds +=
            1;

        return resolve(
            selectorKey,
            options
        ).element;
    }

    function findAll(
        selectorKey,
        options = {}
    ) {
        metrics.findAllCalls +=
            1;

        const definition =
            getDefinitionInternal(
                selectorKey
            );

        if (!definition) {
            return [];
        }

        const root =
            options.root &&
            typeof options.root
                .querySelectorAll ===
                "function"
                ? options.root
                : document;

        const requireVisible =
            options.visible ??
            definition.visible;

        const candidates = [
            definition.selector,
            ...definition.fallbacks,
        ];

        for (
            const selector of
            candidates
        ) {
            const queryResult =
                safelyQueryAll(
                    selector,
                    root
                );

            if (
                queryResult &&
                queryResult.selectorError
            ) {
                continue;
            }

            let elements =
                queryResult;

            if (requireVisible) {
                elements =
                    elements.filter(
                        elementIsVisible
                    );
            }

            if (
                elements.length >
                0
            ) {
                return elements;
            }
        }

        return [];
    }

    function exists(
        selectorKey,
        options = {}
    ) {
        return Boolean(
            find(
                selectorKey,
                options
            )
        );
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

    async function waitFor(
        selectorKey,
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
                : DEFAULT_WAIT_TIMEOUT_MS;

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
            const resolution =
                resolve(
                    selectorKey,
                    options
                );

            if (
                resolution.found
            ) {
                return resolution;
            }

            await delay(
                pollIntervalMs
            );
        }

        metrics.waitTimeouts +=
            1;

        recordActivity(
            "wait-timeout"
        );

        const result =
            createResolutionResult({
                key:
                    normalizeKey(
                        selectorKey
                    ),

                found:
                    false,

                error: {
                    name:
                        "SelectorTimeoutError",

                    message:
                        `Timed out waiting for selector "${String(selectorKey)}".`,
                },
            });

        if (
            options.rejectOnTimeout ===
            true
        ) {
            const error =
                new Error(
                    result.error.message
                );

            error.name =
                result.error.name;

            throw error;
        }

        return result;
    }

    async function validate(
        selectorKey,
        options = {}
    ) {
        metrics.validations +=
            1;

        metrics.lastValidationAt =
            Date.now();

        const definition =
            getDefinitionInternal(
                selectorKey
            );

        if (!definition) {
            metrics.validationFailures +=
                1;

            return {
                key:
                    String(
                        selectorKey
                    ),

                valid:
                    false,

                found:
                    false,

                required:
                    false,

                selector:
                    null,

                source:
                    null,

                reason:
                    "selector-not-registered",

                validatedAt:
                    Date.now(),
            };
        }

        const runtime =
            getRuntimeRecord(
                definition.key
            );

        runtime.validationCount +=
            1;

        runtime.lastValidatedAt =
            Date.now();

        const timeoutMs =
            Number.isSafeInteger(
                options.timeoutMs
            ) &&
            options.timeoutMs > 0
                ? options.timeoutMs
                : DEFAULT_VALIDATION_TIMEOUT_MS;

        const resolution =
            options.wait ===
            true
                ? await waitFor(
                      definition.key,
                      {
                          ...options,

                          timeoutMs,

                          rejectOnTimeout:
                              false,
                      }
                  )
                : resolve(
                      definition.key,
                      options
                  );

        const valid =
            resolution.found ===
            true;

        runtime.lastValidationPassed =
            valid;

        if (valid) {
            runtime.validationPasses +=
                1;

            metrics.validationPasses +=
                1;

            definition.lastVerifiedAt =
                Date.now();
        } else {
            runtime.validationFailures +=
                1;

            metrics.validationFailures +=
                1;
        }

        recordActivity(
            valid
                ? "validation-passed"
                : "validation-failed"
        );

        return {
            key:
                definition.key,

            valid,

            found:
                resolution.found,

            required:
                definition.required,

            verified:
                definition.verified,

            selector:
                resolution.selector,

            source:
                resolution.source,

            fallbackIndex:
                resolution
                    .fallbackIndex,

            reason:
                valid
                    ? "selector-found"
                    : "selector-not-found",

            validatedAt:
                Date.now(),
        };
    }

    async function validateAll(
        options = {}
    ) {
        const definitions =
            list(
                options.filters ||
                {}
            );

        const results =
            [];

        for (
            const entry of
            definitions
        ) {
            results.push(
                await validate(
                    entry.definition.key,
                    options
                )
            );
        }

        return {
            validatedAt:
                Date.now(),

            total:
                results.length,

            passed:
                results.filter(
                    (result) =>
                        result.valid
                ).length,

            failed:
                results.filter(
                    (result) =>
                        !result.valid
                ).length,

            requiredFailures:
                results.filter(
                    (result) =>
                        result.required &&
                        !result.valid
                ).length,

            results,
        };
    }

    function inspect() {
        const entries =
            list();

        const fallbackUsers =
            entries.filter(
                (entry) =>
                    entry.runtime
                        .lastResolutionSource ===
                    "fallback"
            );

        const unresolvedSelectors =
            entries.filter(
                (entry) =>
                    entry.runtime
                        .missingCount >
                    0 &&
                    entry.runtime
                        .lastResolutionSource ===
                    null
            );

        return {
            service:
                "selectors",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            selectorCount:
                registry.size,

            requiredCount:
                entries.filter(
                    (entry) =>
                        entry.definition
                            .required
                ).length,

            verifiedCount:
                entries.filter(
                    (entry) =>
                        entry.definition
                            .verified
                ).length,

            fallbackInUseCount:
                fallbackUsers.length,

            unresolvedCount:
                unresolvedSelectors
                    .length,

            fallbackInUse:
                fallbackUsers,

            unresolved:
                unresolvedSelectors,

            selectors:
                entries,

            metrics: {
                ...metrics,
            },

            defaults: {
                waitTimeoutMs:
                    DEFAULT_WAIT_TIMEOUT_MS,

                validationTimeoutMs:
                    DEFAULT_VALIDATION_TIMEOUT_MS,
            },
        };
    }

    TACTIC.services.selectors =
        Object.freeze({
            register,
            registerMany,
            unregister,

            has,
            get,
            list,

            resolve,
            find,
            findAll,
            exists,
            waitFor,

            validate,
            validateAll,

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
                "selectors",

            selectorCount:
                0,

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Selector Registry service loaded"
    );
})();