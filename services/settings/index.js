/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/settings/index.js
 *
 * Purpose:
 * Provides namespaced, typed, validated, persistent settings
 * for the TACTIC framework and its applications.
 *
 * Responsibilities:
 * - Create and manage settings namespaces
 * - Define typed settings schemas
 * - Validate setting values
 * - Supply defaults
 * - Persist values through the Storage service
 * - Emit settings-change events
 * - Support reset, import, export, and inspection
 * - Prepare settings for future schema migrations
 *
 * Does NOT:
 * - Render a settings interface
 * - Manipulate the DOM
 * - Contain application business logic
 * - Store data outside the Storage service
 *
 * Public API:
 * - namespace()
 * - hasNamespace()
 * - getNamespace()
 * - listNamespaces()
 * - inspect()
 * - exportAll()
 * - importAll()
 *
 * Namespace API:
 * - define()
 * - get()
 * - getAll()
 * - set()
 * - update()
 * - has()
 * - reset()
 * - resetAll()
 * - inspect()
 * - export()
 * - import()
 *
 * Dependencies:
 * - core/constants.js
 * - core/events.js
 * - core/logger.js
 * - core/errors.js
 * - core/health.js
 * - core/storage.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Settings] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        storage,
        events,
        logger,
        errors,
        health,
    } = services;

    const {
        EVENTS,
        ERROR_CODES,
        SEVERITY,
        HEALTH_STATES,
    } = constants;

    if (!storage) {
        console.error(
            "[TACTIC Settings] Storage service is unavailable."
        );

        return;
    }

    const SERVICE_NAME =
        "service:settings";

    const STORAGE_PREFIX =
        "settings";

    const SUPPORTED_TYPES =
        Object.freeze({
            BOOLEAN:
                "boolean",

            NUMBER:
                "number",

            STRING:
                "string",

            ARRAY:
                "array",

            OBJECT:
                "object",

            ANY:
                "any",
        });

    const namespaces =
        new Map();

    const metrics = {
        startedAt:
            Date.now(),

        namespacesCreated:
            0,

        definitionsCreated:
            0,

        getCalls:
            0,

        setCalls:
            0,

        updateCalls:
            0,

        resetCalls:
            0,

        resetAllCalls:
            0,

        exportsCreated:
            0,

        importsProcessed:
            0,

        validationFailures:
            0,

        storageReads:
            0,

        storageWrites:
            0,

        lastActivityAt:
            Date.now(),

        lastNamespace:
            null,

        lastSetting:
            null,

        lastOperation:
            null,
    };

    function recordActivity(
        operation,
        namespaceId = null,
        settingKey = null
    ) {
        metrics.lastOperation =
            operation;

        metrics.lastNamespace =
            namespaceId;

        metrics.lastSetting =
            settingKey;

        metrics.lastActivityAt =
            Date.now();

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    lastNamespace:
                        namespaceId,

                    lastSetting:
                        settingKey,

                    namespaceCount:
                        namespaces.size,
                },
            }
        );
    }

    function isPlainObject(
        value
    ) {
        if (
            value === null ||
            typeof value !==
                "object" ||
            Array.isArray(value)
        ) {
            return false;
        }

        const prototype =
            Object.getPrototypeOf(
                value
            );

        return (
            prototype ===
                Object.prototype ||
            prototype ===
                null
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
                return value;
            }
        }

        return value;
    }

    function deepEqual(
        first,
        second
    ) {
        if (
            Object.is(
                first,
                second
            )
        ) {
            return true;
        }

        if (
            typeof first !==
                typeof second
        ) {
            return false;
        }

        if (
            Array.isArray(first) &&
            Array.isArray(second)
        ) {
            if (
                first.length !==
                second.length
            ) {
                return false;
            }

            return first.every(
                (
                    value,
                    index
                ) =>
                    deepEqual(
                        value,
                        second[index]
                    )
            );
        }

        if (
            isPlainObject(first) &&
            isPlainObject(second)
        ) {
            const firstKeys =
                Object.keys(first);

            const secondKeys =
                Object.keys(second);

            if (
                firstKeys.length !==
                secondKeys.length
            ) {
                return false;
            }

            return firstKeys.every(
                (key) =>
                    Object.prototype
                        .hasOwnProperty
                        .call(
                            second,
                            key
                        ) &&
                    deepEqual(
                        first[key],
                        second[key]
                    )
            );
        }

        return false;
    }

    function normalizeIdentifier(
        value,
        label
    ) {
        if (
            typeof value !==
                "string" ||
            !value.trim()
        ) {
            throw new TypeError(
                `${label} must be a non-empty string.`
            );
        }

        const normalized =
            value.trim();

        if (
            !/^[a-zA-Z0-9:_-]+$/
                .test(normalized)
        ) {
            throw new TypeError(
                `${label} may only contain letters, numbers, colons, underscores, and hyphens.`
            );
        }

        return normalized;
    }

    function normalizeNamespaceId(
        namespaceId
    ) {
        return normalizeIdentifier(
            namespaceId,
            "Settings namespace"
        );
    }

    function normalizeSettingKey(
        settingKey
    ) {
        return normalizeIdentifier(
            settingKey,
            "Setting key"
        );
    }

    function normalizeNamespaceMetadata(
        namespaceId,
        metadata = {}
    ) {
        return {
            id:
                namespaceId,

            displayName:
                typeof metadata
                    .displayName ===
                    "string" &&
                metadata.displayName
                    .trim()
                    ? metadata
                          .displayName
                          .trim()
                    : namespaceId,

            description:
                typeof metadata
                    .description ===
                    "string"
                    ? metadata
                          .description
                          .trim()
                    : "",

            version:
                typeof metadata
                    .version ===
                    "string" &&
                metadata.version.trim()
                    ? metadata
                          .version
                          .trim()
                    : "1.0.0",

            category:
                typeof metadata
                    .category ===
                    "string" &&
                metadata.category.trim()
                    ? metadata
                          .category
                          .trim()
                    : "General",

            metadata:
                isPlainObject(
                    metadata.metadata
                )
                    ? {
                          ...metadata
                              .metadata,
                      }
                    : {},
        };
    }

    function inferType(
        value
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            return SUPPORTED_TYPES.ANY;
        }

        if (
            Array.isArray(value)
        ) {
            return SUPPORTED_TYPES.ARRAY;
        }

        if (
            isPlainObject(value)
        ) {
            return SUPPORTED_TYPES.OBJECT;
        }

        if (
            typeof value ===
            "boolean"
        ) {
            return SUPPORTED_TYPES.BOOLEAN;
        }

        if (
            typeof value ===
            "number"
        ) {
            return SUPPORTED_TYPES.NUMBER;
        }

        if (
            typeof value ===
            "string"
        ) {
            return SUPPORTED_TYPES.STRING;
        }

        return SUPPORTED_TYPES.ANY;
    }

    function normalizeDefinition(
        key,
        definition
    ) {
        const normalizedKey =
            normalizeSettingKey(
                key
            );

        const source =
            isPlainObject(
                definition
            )
                ? definition
                : {
                      default:
                          definition,
                  };

        const type =
            typeof source.type ===
                "string"
                ? source.type
                      .trim()
                      .toLowerCase()
                : inferType(
                      source.default
                  );

        if (
            !Object.values(
                SUPPORTED_TYPES
            ).includes(type)
        ) {
            throw new TypeError(
                `Unsupported settings type "${type}" for "${normalizedKey}".`
            );
        }

        const allowed =
            Array.isArray(
                source.allowed
            )
                ? source.allowed.map(
                      cloneValue
                  )
                : null;

        const normalized = {
            key:
                normalizedKey,

            type,

            default:
                cloneValue(
                    source.default
                ),

            required:
                source.required ===
                true,

            minimum:
                Number.isFinite(
                    source.minimum
                )
                    ? Number(
                          source.minimum
                      )
                    : null,

            maximum:
                Number.isFinite(
                    source.maximum
                )
                    ? Number(
                          source.maximum
                      )
                    : null,

            integer:
                source.integer ===
                true,

            minimumLength:
                Number.isSafeInteger(
                    source.minimumLength
                ) &&
                source.minimumLength >=
                    0
                    ? source
                          .minimumLength
                    : null,

            maximumLength:
                Number.isSafeInteger(
                    source.maximumLength
                ) &&
                source.maximumLength >=
                    0
                    ? source
                          .maximumLength
                    : null,

            allowed,

            validate:
                typeof source
                    .validate ===
                    "function"
                    ? source.validate
                    : null,

            transform:
                typeof source
                    .transform ===
                    "function"
                    ? source.transform
                    : null,

            label:
                typeof source.label ===
                    "string" &&
                source.label.trim()
                    ? source.label
                          .trim()
                    : normalizedKey,

            description:
                typeof source
                    .description ===
                    "string"
                    ? source
                          .description
                          .trim()
                    : "",

            category:
                typeof source
                    .category ===
                    "string" &&
                source.category.trim()
                    ? source.category
                          .trim()
                    : "General",

            hidden:
                source.hidden ===
                true,

            readonly:
                source.readonly ===
                true,

            metadata:
                isPlainObject(
                    source.metadata
                )
                    ? {
                          ...source
                              .metadata,
                      }
                    : {},
        };

        const validation =
            validateValue(
                normalized,
                normalized.default,
                {
                    allowUndefined:
                        !normalized.required,

                    applyTransform:
                        false,
                }
            );

        if (
            !validation.valid
        ) {
            throw new TypeError(
                `Default value for setting "${normalizedKey}" is invalid: ${validation.message}`
            );
        }

        normalized.default =
            cloneValue(
                validation.value
            );

        return normalized;
    }

    function validateType(
        type,
        value
    ) {
        switch (type) {
            case SUPPORTED_TYPES.BOOLEAN:
                return typeof value ===
                    "boolean";

            case SUPPORTED_TYPES.NUMBER:
                return (
                    typeof value ===
                        "number" &&
                    Number.isFinite(
                        value
                    )
                );

            case SUPPORTED_TYPES.STRING:
                return typeof value ===
                    "string";

            case SUPPORTED_TYPES.ARRAY:
                return Array.isArray(
                    value
                );

            case SUPPORTED_TYPES.OBJECT:
                return isPlainObject(
                    value
                );

            case SUPPORTED_TYPES.ANY:
            default:
                return true;
        }
    }

    function validateValue(
        definition,
        suppliedValue,
        options = {}
    ) {
        let value =
            cloneValue(
                suppliedValue
            );

        if (
            value === undefined &&
            options.allowUndefined ===
                true
        ) {
            return {
                valid:
                    true,

                value:
                    undefined,

                message:
                    null,
            };
        }

        if (
            definition.transform &&
            options.applyTransform !==
                false
        ) {
            try {
                value =
                    definition.transform(
                        value
                    );
            } catch (error) {
                return {
                    valid:
                        false,

                    value,

                    message:
                        `Transform failed: ${error.message}`,

                    error,
                };
            }
        }

        if (
            definition.required &&
            (
                value === null ||
                value === undefined ||
                value === ""
            )
        ) {
            return {
                valid:
                    false,

                value,

                message:
                    "A value is required.",
            };
        }

        if (
            !validateType(
                definition.type,
                value
            )
        ) {
            return {
                valid:
                    false,

                value,

                message:
                    `Expected type "${definition.type}".`,
            };
        }

        if (
            definition.type ===
            SUPPORTED_TYPES.NUMBER
        ) {
            if (
                definition.integer &&
                !Number.isInteger(
                    value
                )
            ) {
                return {
                    valid:
                        false,

                    value,

                    message:
                        "Expected an integer.",
                };
            }

            if (
                definition.minimum !==
                    null &&
                value <
                    definition.minimum
            ) {
                return {
                    valid:
                        false,

                    value,

                    message:
                        `Value must be at least ${definition.minimum}.`,
                };
            }

            if (
                definition.maximum !==
                    null &&
                value >
                    definition.maximum
            ) {
                return {
                    valid:
                        false,

                    value,

                    message:
                        `Value must be no greater than ${definition.maximum}.`,
                };
            }
        }

        if (
            definition.type ===
                SUPPORTED_TYPES.STRING ||
            definition.type ===
                SUPPORTED_TYPES.ARRAY
        ) {
            if (
                definition.minimumLength !==
                    null &&
                value.length <
                    definition.minimumLength
            ) {
                return {
                    valid:
                        false,

                    value,

                    message:
                        `Value must contain at least ${definition.minimumLength} item(s).`,
                };
            }

            if (
                definition.maximumLength !==
                    null &&
                value.length >
                    definition.maximumLength
            ) {
                return {
                    valid:
                        false,

                    value,

                    message:
                        `Value must contain no more than ${definition.maximumLength} item(s).`,
                };
            }
        }

        if (
            definition.allowed &&
            !definition.allowed.some(
                (allowedValue) =>
                    deepEqual(
                        allowedValue,
                        value
                    )
            )
        ) {
            return {
                valid:
                    false,

                value,

                message:
                    "Value is not in the allowed values list.",
            };
        }

        if (
            definition.validate
        ) {
            try {
                const customResult =
                    definition.validate(
                        value
                    );

                if (
                    customResult ===
                    false
                ) {
                    return {
                        valid:
                            false,

                        value,

                        message:
                            "Custom validation failed.",
                    };
                }

                if (
                    typeof customResult ===
                        "string"
                ) {
                    return {
                        valid:
                            false,

                        value,

                        message:
                            customResult,
                    };
                }

                if (
                    isPlainObject(
                        customResult
                    ) &&
                    customResult.valid ===
                        false
                ) {
                    return {
                        valid:
                            false,

                        value,

                        message:
                            customResult
                                .message ||
                            "Custom validation failed.",
                    };
                }
            } catch (error) {
                return {
                    valid:
                        false,

                    value,

                    message:
                        `Custom validation threw an error: ${error.message}`,

                    error,
                };
            }
        }

        return {
            valid:
                true,

            value:
                cloneValue(
                    value
                ),

            message:
                null,
        };
    }

    function buildStorageKey(
        namespaceId
    ) {
        return `${STORAGE_PREFIX}:${namespaceId}`;
    }

    function createStoredRecord(
        namespaceRecord,
        values
    ) {
        return {
            namespace:
                namespaceRecord.id,

            version:
                namespaceRecord.version,

            updatedAt:
                Date.now(),

            values:
                cloneValue(
                    values
                ),
        };
    }

    function readStoredRecord(
        namespaceRecord
    ) {
        metrics.storageReads +=
            1;

        const key =
            buildStorageKey(
                namespaceRecord.id
            );

        const record =
            storage.getJson(
                key,
                null
            );

        if (
            !record ||
            !isPlainObject(record)
        ) {
            return null;
        }

        if (
            !isPlainObject(
                record.values
            )
        ) {
            return null;
        }

        return record;
    }

    function writeStoredValues(
        namespaceRecord,
        values
    ) {
        metrics.storageWrites +=
            1;

        const key =
            buildStorageKey(
                namespaceRecord.id
            );

        const record =
            createStoredRecord(
                namespaceRecord,
                values
            );

        storage.set(
            key,
            JSON.stringify(
                record
            )
        );

        namespaceRecord.updatedAt =
            record.updatedAt;

        return record;
    }

    function reportValidationFailure({
        namespaceId,
        settingKey,
        value,
        message,
        error = null,
    }) {
        metrics.validationFailures +=
            1;

        errors?.report({
            code:
                ERROR_CODES
                    .SETTINGS
                    .VALIDATION_FAILED,

            severity:
                SEVERITY.WARNING,

            service:
                "settings",

            message:
                `Setting "${namespaceId}.${settingKey}" was rejected: ${message}`,

            details: {
                namespaceId,
                settingKey,
                value:
                    cloneValue(
                        value
                    ),
            },

            error,

            recoverable:
                true,

            recovery:
                "Provide a value that satisfies the setting definition.",
        });
    }

    function emitSettingChanged({
        namespaceRecord,
        settingKey,
        value,
        previousValue,
        source,
    }) {
        events?.emit(
            EVENTS.SETTINGS.CHANGED,
            {
                namespace:
                    namespaceRecord.id,

                key:
                    settingKey,

                value:
                    cloneValue(
                        value
                    ),

                previousValue:
                    cloneValue(
                        previousValue
                    ),

                source,

                timestamp:
                    Date.now(),
            }
        );
    }

    function buildDefaults(
        namespaceRecord
    ) {
        const defaults =
            {};

        for (
            const [
                key,
                definition,
            ] of namespaceRecord
                .definitions
        ) {
            defaults[key] =
                cloneValue(
                    definition.default
                );
        }

        return defaults;
    }

    function loadValues(
        namespaceRecord
    ) {
        const defaults =
            buildDefaults(
                namespaceRecord
            );

        const stored =
            readStoredRecord(
                namespaceRecord
            );

        if (!stored) {
            namespaceRecord.values =
                defaults;

            writeStoredValues(
                namespaceRecord,
                namespaceRecord.values
            );

            events?.emit(
                EVENTS.SETTINGS.LOADED,
                {
                    namespace:
                        namespaceRecord.id,

                    source:
                        "defaults",

                    values:
                        cloneValue(
                            namespaceRecord
                                .values
                        ),
                }
            );

            return;
        }

        const values = {
            ...defaults,
        };

        for (
            const [
                key,
                definition,
            ] of namespaceRecord
                .definitions
        ) {
            if (
                !Object.prototype
                    .hasOwnProperty
                    .call(
                        stored.values,
                        key
                    )
            ) {
                continue;
            }

            const validation =
                validateValue(
                    definition,
                    stored.values[key]
                );

            if (
                validation.valid
            ) {
                values[key] =
                    validation.value;

                continue;
            }

            reportValidationFailure({
                namespaceId:
                    namespaceRecord.id,

                settingKey:
                    key,

                value:
                    stored.values[key],

                message:
                    `Stored value was invalid. The default was restored. ${validation.message}`,

                error:
                    validation.error,
            });
        }

        namespaceRecord.values =
            values;

        namespaceRecord.updatedAt =
            Number.isFinite(
                stored.updatedAt
            )
                ? stored.updatedAt
                : Date.now();

        /*
         * Rewrite the normalized record so missing or invalid
         * values are replaced with valid defaults.
         */
        writeStoredValues(
            namespaceRecord,
            namespaceRecord.values
        );

        events?.emit(
            EVENTS.SETTINGS.LOADED,
            {
                namespace:
                    namespaceRecord.id,

                source:
                    "storage",

                values:
                    cloneValue(
                        namespaceRecord
                            .values
                    ),
            }
        );
    }

    function createDefinitionSnapshot(
        definition
    ) {
        return {
            key:
                definition.key,

            type:
                definition.type,

            default:
                cloneValue(
                    definition.default
                ),

            required:
                definition.required,

            minimum:
                definition.minimum,

            maximum:
                definition.maximum,

            integer:
                definition.integer,

            minimumLength:
                definition.minimumLength,

            maximumLength:
                definition.maximumLength,

            allowed:
                definition.allowed
                    ? cloneValue(
                          definition
                              .allowed
                      )
                    : null,

            hasCustomValidator:
                Boolean(
                    definition.validate
                ),

            hasTransform:
                Boolean(
                    definition.transform
                ),

            label:
                definition.label,

            description:
                definition.description,

            category:
                definition.category,

            hidden:
                definition.hidden,

            readonly:
                definition.readonly,

            metadata: {
                ...definition.metadata,
            },
        };
    }

    function createNamespaceSnapshot(
        namespaceRecord
    ) {
        return {
            id:
                namespaceRecord.id,

            displayName:
                namespaceRecord
                    .displayName,

            description:
                namespaceRecord
                    .description,

            version:
                namespaceRecord.version,

            category:
                namespaceRecord.category,

            createdAt:
                namespaceRecord.createdAt,

            updatedAt:
                namespaceRecord.updatedAt,

            definitionCount:
                namespaceRecord
                    .definitions.size,

            loaded:
                namespaceRecord.loaded,

            metadata: {
                ...namespaceRecord.metadata,
            },

            values:
                cloneValue(
                    namespaceRecord.values
                ),

            definitions: [
                ...namespaceRecord
                    .definitions
                    .values(),
            ].map(
                createDefinitionSnapshot
            ),
        };
    }

    function createNamespaceApi(
        namespaceRecord
    ) {
        function define(
            schema
        ) {
            if (
                !isPlainObject(
                    schema
                )
            ) {
                throw new TypeError(
                    "Settings schema must be an object."
                );
            }

            for (
                const [
                    key,
                    definition,
                ] of Object.entries(
                    schema
                )
            ) {
                const normalized =
                    normalizeDefinition(
                        key,
                        definition
                    );

                namespaceRecord
                    .definitions
                    .set(
                        normalized.key,
                        normalized
                    );

                metrics.definitionsCreated +=
                    1;
            }

            namespaceRecord.loaded =
                true;

            loadValues(
                namespaceRecord
            );

            recordActivity(
                "define",
                namespaceRecord.id
            );

            return createNamespaceSnapshot(
                namespaceRecord
            );
        }

        function requireDefinition(
            settingKey
        ) {
            const normalizedKey =
                normalizeSettingKey(
                    settingKey
                );

            const definition =
                namespaceRecord
                    .definitions
                    .get(
                        normalizedKey
                    );

            if (!definition) {
                throw new Error(
                    `Setting "${namespaceRecord.id}.${normalizedKey}" has not been defined.`
                );
            }

            return {
                key:
                    normalizedKey,

                definition,
            };
        }

        function get(
            settingKey,
            fallbackValue =
                undefined
        ) {
            metrics.getCalls +=
                1;

            const normalizedKey =
                normalizeSettingKey(
                    settingKey
                );

            recordActivity(
                "get",
                namespaceRecord.id,
                normalizedKey
            );

            if (
                Object.prototype
                    .hasOwnProperty
                    .call(
                        namespaceRecord
                            .values,
                        normalizedKey
                    )
            ) {
                return cloneValue(
                    namespaceRecord
                        .values[
                        normalizedKey
                    ]
                );
            }

            if (
                fallbackValue !==
                undefined
            ) {
                return cloneValue(
                    fallbackValue
                );
            }

            const definition =
                namespaceRecord
                    .definitions
                    .get(
                        normalizedKey
                    );

            return definition
                ? cloneValue(
                      definition.default
                  )
                : undefined;
        }

        function getAll() {
            metrics.getCalls +=
                1;

            recordActivity(
                "getAll",
                namespaceRecord.id
            );

            return cloneValue(
                namespaceRecord.values
            );
        }

        function has(
            settingKey
        ) {
            const normalizedKey =
                normalizeSettingKey(
                    settingKey
                );

            return (
                namespaceRecord
                    .definitions
                    .has(
                        normalizedKey
                    ) ||
                Object.prototype
                    .hasOwnProperty
                    .call(
                        namespaceRecord
                            .values,
                        normalizedKey
                    )
            );
        }

        function set(
            settingKey,
            suppliedValue,
            options = {}
        ) {
            metrics.setCalls +=
                1;

            const {
                key,
                definition,
            } = requireDefinition(
                settingKey
            );

            if (
                definition.readonly &&
                options.force !==
                    true
            ) {
                throw new Error(
                    `Setting "${namespaceRecord.id}.${key}" is read-only.`
                );
            }

            const validation =
                validateValue(
                    definition,
                    suppliedValue
                );

            if (
                !validation.valid
            ) {
                reportValidationFailure({
                    namespaceId:
                        namespaceRecord.id,

                    settingKey:
                        key,

                    value:
                        suppliedValue,

                    message:
                        validation.message,

                    error:
                        validation.error,
                });

                if (
                    options.throwOnError !==
                    false
                ) {
                    throw new TypeError(
                        validation.message
                    );
                }

                return false;
            }

            const previousValue =
                cloneValue(
                    namespaceRecord
                        .values[key]
                );

            if (
                deepEqual(
                    previousValue,
                    validation.value
                )
            ) {
                return cloneValue(
                    validation.value
                );
            }

            namespaceRecord
                .values[key] =
                cloneValue(
                    validation.value
                );

            writeStoredValues(
                namespaceRecord,
                namespaceRecord.values
            );

            recordActivity(
                "set",
                namespaceRecord.id,
                key
            );

            emitSettingChanged({
                namespaceRecord,

                settingKey:
                    key,

                value:
                    validation.value,

                previousValue,

                source:
                    options.source ||
                    "set",
            });

            return cloneValue(
                validation.value
            );
        }

        function update(
            settingKey,
            updater,
            options = {}
        ) {
            metrics.updateCalls +=
                1;

            if (
                typeof updater !==
                "function"
            ) {
                throw new TypeError(
                    "Settings updater must be a function."
                );
            }

            const currentValue =
                get(
                    settingKey
                );

            const nextValue =
                updater(
                    cloneValue(
                        currentValue
                    )
                );

            return set(
                settingKey,
                nextValue,
                {
                    ...options,

                    source:
                        options.source ||
                        "update",
                }
            );
        }

        function reset(
            settingKey
        ) {
            metrics.resetCalls +=
                1;

            const {
                key,
                definition,
            } = requireDefinition(
                settingKey
            );

            recordActivity(
                "reset",
                namespaceRecord.id,
                key
            );

            const result =
                set(
                    key,
                    definition.default,
                    {
                        force:
                            true,

                        source:
                            "reset",
                    }
                );

            events?.emit(
                EVENTS.SETTINGS.RESET,
                {
                    namespace:
                        namespaceRecord.id,

                    key,

                    value:
                        cloneValue(
                            result
                        ),

                    timestamp:
                        Date.now(),
                }
            );

            return result;
        }

        function resetAll() {
            metrics.resetAllCalls +=
                1;

            const previousValues =
                cloneValue(
                    namespaceRecord.values
                );

            namespaceRecord.values =
                buildDefaults(
                    namespaceRecord
                );

            writeStoredValues(
                namespaceRecord,
                namespaceRecord.values
            );

            recordActivity(
                "resetAll",
                namespaceRecord.id
            );

            events?.emit(
                EVENTS.SETTINGS.RESET,
                {
                    namespace:
                        namespaceRecord.id,

                    key:
                        null,

                    values:
                        cloneValue(
                            namespaceRecord
                                .values
                        ),

                    previousValues,

                    timestamp:
                        Date.now(),
                }
            );

            return cloneValue(
                namespaceRecord.values
            );
        }

        function inspect() {
            return createNamespaceSnapshot(
                namespaceRecord
            );
        }

        function exportNamespace() {
            metrics.exportsCreated +=
                1;

            recordActivity(
                "export",
                namespaceRecord.id
            );

            return {
                format:
                    "TACTIC_SETTINGS_NAMESPACE",

                formatVersion:
                    1,

                exportedAt:
                    new Date()
                        .toISOString(),

                namespace:
                    namespaceRecord.id,

                namespaceVersion:
                    namespaceRecord.version,

                values:
                    cloneValue(
                        namespaceRecord.values
                    ),
            };
        }

        function importNamespace(
            payload,
            options = {}
        ) {
            metrics.importsProcessed +=
                1;

            if (
                !isPlainObject(
                    payload
                )
            ) {
                throw new TypeError(
                    "Settings import payload must be an object."
                );
            }

            const importedValues =
                isPlainObject(
                    payload.values
                )
                    ? payload.values
                    : payload;

            const results = {
                namespace:
                    namespaceRecord.id,

                imported:
                    [],

                rejected:
                    [],

                ignored:
                    [],
            };

            for (
                const [
                    key,
                    value,
                ] of Object.entries(
                    importedValues
                )
            ) {
                if (
                    !namespaceRecord
                        .definitions
                        .has(key)
                ) {
                    results.ignored.push({
                        key,

                        reason:
                            "Setting is not defined.",
                    });

                    continue;
                }

                try {
                    set(
                        key,
                        value,
                        {
                            force:
                                options.force ===
                                true,

                            source:
                                "import",

                            throwOnError:
                                true,
                        }
                    );

                    results.imported.push(
                        key
                    );
                } catch (error) {
                    results.rejected.push({
                        key,

                        reason:
                            error.message,
                    });
                }
            }

            recordActivity(
                "import",
                namespaceRecord.id
            );

            events?.emit(
                EVENTS.SETTINGS.LOADED,
                {
                    namespace:
                        namespaceRecord.id,

                    source:
                        "import",

                    results:
                        cloneValue(
                            results
                        ),

                    values:
                        cloneValue(
                            namespaceRecord
                                .values
                        ),
                }
            );

            if (
                options.throwOnRejected ===
                    true &&
                results.rejected.length >
                    0
            ) {
                throw new Error(
                    `${results.rejected.length} imported setting(s) were rejected.`
                );
            }

            return results;
        }

        return Object.freeze({
            id:
                namespaceRecord.id,

            define,
            get,
            getAll,
            set,
            update,
            has,
            reset,
            resetAll,
            inspect,

            export:
                exportNamespace,

            import:
                importNamespace,
        });
    }

    function namespace(
        namespaceId,
        metadata = {}
    ) {
        const normalizedId =
            normalizeNamespaceId(
                namespaceId
            );

        if (
            namespaces.has(
                normalizedId
            )
        ) {
            return namespaces.get(
                normalizedId
            ).api;
        }

        const normalizedMetadata =
            normalizeNamespaceMetadata(
                normalizedId,
                metadata
            );

        const namespaceRecord = {
            ...normalizedMetadata,

            createdAt:
                Date.now(),

            updatedAt:
                null,

            loaded:
                false,

            definitions:
                new Map(),

            values:
                {},

            api:
                null,
        };

        namespaceRecord.api =
            createNamespaceApi(
                namespaceRecord
            );

        namespaces.set(
            normalizedId,
            namespaceRecord
        );

        metrics.namespacesCreated +=
            1;

        recordActivity(
            "namespace",
            normalizedId
        );

        logger?.debug(
            `Settings namespace created: ${normalizedId}`,
            {
                displayName:
                    namespaceRecord
                        .displayName,

                version:
                    namespaceRecord
                        .version,
            }
        );

        return namespaceRecord.api;
    }

    function hasNamespace(
        namespaceId
    ) {
        try {
            return namespaces.has(
                normalizeNamespaceId(
                    namespaceId
                )
            );
        } catch {
            return false;
        }
    }

    function getNamespace(
        namespaceId
    ) {
        const normalizedId =
            normalizeNamespaceId(
                namespaceId
            );

        return (
            namespaces.get(
                normalizedId
            )?.api ||
            null
        );
    }

    function listNamespaces() {
        return [
            ...namespaces.values(),
        ]
            .map(
                createNamespaceSnapshot
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    first.displayName
                        .localeCompare(
                            second.displayName
                        )
            );
    }

    function exportAll() {
        metrics.exportsCreated +=
            1;

        recordActivity(
            "exportAll"
        );

        return {
            format:
                "TACTIC_SETTINGS_EXPORT",

            formatVersion:
                1,

            frameworkVersion:
                TACTIC.version,

            exportedAt:
                new Date()
                    .toISOString(),

            namespaces:
                Object.fromEntries(
                    [
                        ...namespaces
                            .values(),
                    ].map(
                        (
                            namespaceRecord
                        ) => [
                            namespaceRecord.id,

                            {
                                version:
                                    namespaceRecord
                                        .version,

                                values:
                                    cloneValue(
                                        namespaceRecord
                                            .values
                                    ),
                            },
                        ]
                    )
                ),
        };
    }

    function importAll(
        payload,
        options = {}
    ) {
        metrics.importsProcessed +=
            1;

        if (
            !isPlainObject(
                payload
            )
        ) {
            throw new TypeError(
                "Settings import payload must be an object."
            );
        }

        const importedNamespaces =
            isPlainObject(
                payload.namespaces
            )
                ? payload.namespaces
                : payload;

        const results = {
            imported:
                {},

            missingNamespaces:
                [],

            rejectedNamespaces:
                [],
        };

        for (
            const [
                namespaceId,
                namespacePayload,
            ] of Object.entries(
                importedNamespaces
            )
        ) {
            const target =
                getNamespace(
                    namespaceId
                );

            if (!target) {
                results
                    .missingNamespaces
                    .push(
                        namespaceId
                    );

                continue;
            }

            try {
                results.imported[
                    namespaceId
                ] = target.import(
                    namespacePayload,
                    options
                );
            } catch (error) {
                results
                    .rejectedNamespaces
                    .push({
                        namespace:
                            namespaceId,

                        reason:
                            error.message,
                    });
            }
        }

        recordActivity(
            "importAll"
        );

        return results;
    }

    function inspect() {
        return {
            service:
                "settings",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            namespaceCount:
                namespaces.size,

            namespaces:
                listNamespaces(),

            metrics: {
                ...metrics,
            },

            supportedTypes: {
                ...SUPPORTED_TYPES,
            },
        };
    }

    TACTIC.services.settings = {
        namespace,
        hasNamespace,
        getNamespace,
        listNamespaces,

        inspect,

        exportAll,
        importAll,

        types:
            SUPPORTED_TYPES,
    };

    health?.register({
        name:
            SERVICE_NAME,

        type:
            health.types.SERVICE,

        status:
            HEALTH_STATES.HEALTHY,

        staleAfterMs:
            300_000,

        metadata: {
            serviceName:
                "settings",

            namespaceCount:
                0,

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Settings service loaded"
    );
})();