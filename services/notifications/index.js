/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/notifications/index.js
 *
 * Purpose:
 * Provides centralized user notifications for the TACTIC
 * framework, services, repositories, and applications.
 *
 * Responsibilities:
 * - Display in-page toast notifications
 * - Support info, success, warning, and error levels
 * - Automatically dismiss notifications
 * - Allow manual dismissal and clearing
 * - Prevent unwanted duplicate notifications
 * - Maintain bounded notification history
 * - Emit notification events
 * - Expose diagnostics and metrics
 *
 * Does NOT:
 * - Make browser Notification API requests
 * - Contain application business logic
 * - Persist notification history between page reloads
 * - Render full drawer notification pages
 *
 * Public API:
 * - show()
 * - info()
 * - success()
 * - warning()
 * - error()
 * - dismiss()
 * - clear()
 * - get()
 * - latest()
 * - history()
 * - count()
 * - inspect()
 *
 * Dependencies:
 * - core/constants.js
 * - core/events.js
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
            "[TACTIC Notifications] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
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

    const SERVICE_NAME =
        "service:notifications";

    const CONTAINER_ID =
        "tactic-notification-container";

    const STYLE_ID =
        "tactic-notification-styles";

    const MAX_HISTORY =
        100;

    const DEFAULT_DURATION_MS =
        5000;

    const DEFAULT_DUPLICATE_WINDOW_MS =
        1500;

    const LEVELS =
        Object.freeze({
            INFO:
                "info",

            SUCCESS:
                "success",

            WARNING:
                "warning",

            ERROR:
                "error",
        });

    const ICONS =
        Object.freeze({
            [LEVELS.INFO]:
                "ℹ",

            [LEVELS.SUCCESS]:
                "✓",

            [LEVELS.WARNING]:
                "⚠",

            [LEVELS.ERROR]:
                "✕",
        });

    const DEFAULT_TITLES =
        Object.freeze({
            [LEVELS.INFO]:
                "Information",

            [LEVELS.SUCCESS]:
                "Success",

            [LEVELS.WARNING]:
                "Warning",

            [LEVELS.ERROR]:
                "Error",
        });

    const activeNotifications =
        new Map();

    const notificationHistory =
        [];

    let nextId =
        1;

    const metrics = {
        startedAt:
            Date.now(),

        shown:
            0,

        dismissed:
            0,

        automaticallyDismissed:
            0,

        manuallyDismissed:
            0,

        cleared:
            0,

        duplicatesSuppressed:
            0,

        callbackErrors:
            0,

        activePeak:
            0,

        lastActivityAt:
            Date.now(),

        lastNotificationAt:
            null,

        lastNotificationId:
            null,

        byLevel: {
            info:
                0,

            success:
                0,

            warning:
                0,

            error:
                0,
        },
    };

    function recordActivity(
        operation,
        notification = null
    ) {
        metrics.lastActivityAt =
            Date.now();

        if (notification) {
            metrics.lastNotificationAt =
                notification.createdAt;

            metrics.lastNotificationId =
                notification.id;
        }

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    activeCount:
                        activeNotifications.size,

                    historyCount:
                        notificationHistory.length,

                    lastNotificationId:
                        metrics.lastNotificationId,
                },
            }
        );
    }

    function normalizeLevel(
        level
    ) {
        const normalized =
            String(
                level ||
                LEVELS.INFO
            )
                .trim()
                .toLowerCase();

        return Object.values(
            LEVELS
        ).includes(normalized)
            ? normalized
            : LEVELS.INFO;
    }

    function normalizeText(
        value,
        fallback = ""
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            return fallback;
        }

        const normalized =
            String(value).trim();

        return normalized ||
            fallback;
    }

    function normalizeDuration(
        durationMs,
        persistent
    ) {
        if (persistent) {
            return 0;
        }

        if (
            Number.isFinite(
                durationMs
            ) &&
            durationMs >= 0
        ) {
            return Math.floor(
                durationMs
            );
        }

        return DEFAULT_DURATION_MS;
    }

    function normalizeOptions(
        options = {}
    ) {
        const level =
            normalizeLevel(
                options.level
            );

        const persistent =
            options.persistent ===
            true;

        return {
            level,

            title:
                normalizeText(
                    options.title,
                    DEFAULT_TITLES[
                        level
                    ]
                ),

            message:
                normalizeText(
                    options.message
                ),

            durationMs:
                normalizeDuration(
                    options.durationMs,
                    persistent
                ),

            persistent,

            dismissible:
                options.dismissible !==
                false,

            suppressDuplicates:
                options
                    .suppressDuplicates !==
                false,

            duplicateWindowMs:
                Number.isFinite(
                    options
                        .duplicateWindowMs
                ) &&
                options
                    .duplicateWindowMs >=
                    0
                    ? Math.floor(
                          options
                              .duplicateWindowMs
                      )
                    : DEFAULT_DUPLICATE_WINDOW_MS,

            group:
                normalizeText(
                    options.group,
                    "default"
                ),

            source:
                normalizeText(
                    options.source,
                    null
                ),

            actionLabel:
                normalizeText(
                    options.actionLabel,
                    null
                ),

            onAction:
                typeof options.onAction ===
                    "function"
                    ? options.onAction
                    : null,

            onDismiss:
                typeof options.onDismiss ===
                    "function"
                    ? options.onDismiss
                    : null,

            metadata:
                options.metadata &&
                typeof options.metadata ===
                    "object" &&
                !Array.isArray(
                    options.metadata
                )
                    ? {
                          ...options.metadata,
                      }
                    : {},
        };
    }

    function createStyles() {
        if (
            document.getElementById(
                STYLE_ID
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                "style"
            );

        style.id =
            STYLE_ID;

        style.textContent = `
            #${CONTAINER_ID} {
                position: fixed;
                top: 18px;
                right: 18px;
                z-index: 2147483646;
                display: flex;
                flex-direction: column;
                gap: 10px;
                width: min(380px, calc(100vw - 36px));
                pointer-events: none;
            }

            .tactic-notification {
                box-sizing: border-box;
                display: grid;
                grid-template-columns: 30px minmax(0, 1fr) auto;
                gap: 10px;
                align-items: start;
                padding: 12px;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-left-width: 4px;
                border-radius: 6px;
                background: rgba(25, 25, 25, 0.97);
                color: #f2f2f2;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
                font-family: Arial, sans-serif;
                pointer-events: auto;
                opacity: 0;
                transform: translateX(24px);
                transition:
                    opacity 160ms ease,
                    transform 160ms ease;
            }

            .tactic-notification[data-visible="true"] {
                opacity: 1;
                transform: translateX(0);
            }

            .tactic-notification[data-level="info"] {
                border-left-color: #4a90e2;
            }

            .tactic-notification[data-level="success"] {
                border-left-color: #43a047;
            }

            .tactic-notification[data-level="warning"] {
                border-left-color: #f5a623;
            }

            .tactic-notification[data-level="error"] {
                border-left-color: #d9534f;
            }

            .tactic-notification__icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.09);
                font-size: 17px;
                font-weight: 700;
            }

            .tactic-notification__content {
                min-width: 0;
            }

            .tactic-notification__title {
                margin: 0 0 4px;
                color: #ffffff;
                font-size: 14px;
                font-weight: 700;
                line-height: 1.25;
            }

            .tactic-notification__message {
                margin: 0;
                color: #d0d0d0;
                font-size: 13px;
                line-height: 1.4;
                overflow-wrap: anywhere;
            }

            .tactic-notification__controls {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .tactic-notification__action,
            .tactic-notification__dismiss {
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.08);
                color: #ffffff;
                cursor: pointer;
                font-family: inherit;
                font-size: 12px;
                line-height: 1;
            }

            .tactic-notification__action {
                padding: 7px 9px;
            }

            .tactic-notification__dismiss {
                width: 28px;
                height: 28px;
                padding: 0;
                font-size: 17px;
            }

            .tactic-notification__action:hover,
            .tactic-notification__dismiss:hover {
                background: rgba(255, 255, 255, 0.16);
            }

            @media (max-width: 600px) {
                #${CONTAINER_ID} {
                    top: 10px;
                    right: 10px;
                    width: calc(100vw - 20px);
                }
            }
        `;

        (
            document.head ||
            document.documentElement
        ).appendChild(
            style
        );
    }

    function getContainer() {
        let container =
            document.getElementById(
                CONTAINER_ID
            );

        if (container) {
            return container;
        }

        createStyles();

        container =
            document.createElement(
                "div"
            );

        container.id =
            CONTAINER_ID;

        container.setAttribute(
            "aria-live",
            "polite"
        );

        container.setAttribute(
            "aria-label",
            "TACTIC notifications"
        );

        (
            document.body ||
            document.documentElement
        ).appendChild(
            container
        );

        return container;
    }

    function createNotificationRecord(
        options
    ) {
        const now =
            Date.now();

        return {
            id:
                nextId++,

            level:
                options.level,

            title:
                options.title,

            message:
                options.message,

            group:
                options.group,

            source:
                options.source,

            durationMs:
                options.durationMs,

            persistent:
                options.persistent,

            dismissible:
                options.dismissible,

            actionLabel:
                options.actionLabel,

            metadata: {
                ...options.metadata,
            },

            createdAt:
                now,

            displayedAt:
                null,

            dismissedAt:
                null,

            dismissReason:
                null,

            active:
                true,

            actionTriggered:
                false,

            element:
                null,

            timeoutHandle:
                null,

            onAction:
                options.onAction,

            onDismiss:
                options.onDismiss,
        };
    }

    function createPublicSnapshot(
        record
    ) {
        if (!record) {
            return null;
        }

        return {
            id:
                record.id,

            level:
                record.level,

            title:
                record.title,

            message:
                record.message,

            group:
                record.group,

            source:
                record.source,

            durationMs:
                record.durationMs,

            persistent:
                record.persistent,

            dismissible:
                record.dismissible,

            actionLabel:
                record.actionLabel,

            createdAt:
                record.createdAt,

            displayedAt:
                record.displayedAt,

            dismissedAt:
                record.dismissedAt,

            dismissReason:
                record.dismissReason,

            active:
                record.active,

            actionTriggered:
                record.actionTriggered,

            metadata: {
                ...record.metadata,
            },
        };
    }

    function trimHistory() {
        if (
            notificationHistory.length <=
            MAX_HISTORY
        ) {
            return;
        }

        notificationHistory.splice(
            0,
            notificationHistory.length -
                MAX_HISTORY
        );
    }

    function findDuplicate(
        options
    ) {
        if (
            !options.suppressDuplicates
        ) {
            return null;
        }

        const now =
            Date.now();

        return [
            ...activeNotifications.values(),
        ].find(
            (record) =>
                record.level ===
                    options.level &&
                record.title ===
                    options.title &&
                record.message ===
                    options.message &&
                record.group ===
                    options.group &&
                now -
                    record.createdAt <=
                    options
                        .duplicateWindowMs
        ) || null;
    }

    function reportCallbackError(
        callbackName,
        record,
        error
    ) {
        metrics.callbackErrors +=
            1;

        errors?.report({
            code:
                ERROR_CODES
                    .NOTIFICATION
                    .FAILED,

            severity:
                SEVERITY.ERROR,

            service:
                "notifications",

            message:
                `Notification ${callbackName} callback failed.`,

            details: {
                notificationId:
                    record.id,

                level:
                    record.level,

                title:
                    record.title,
            },

            error:
                error instanceof Error
                    ? error
                    : new Error(
                          String(error)
                      ),

            recoverable:
                true,

            recovery:
                "Correct the notification callback.",
        });
    }

    function invokeCallback(
        callbackName,
        callback,
        record
    ) {
        if (
            typeof callback !==
            "function"
        ) {
            return;
        }

        try {
            callback(
                createPublicSnapshot(
                    record
                )
            );
        } catch (error) {
            reportCallbackError(
                callbackName,
                record,
                error
            );
        }
    }

    function renderNotification(
        record
    ) {
        const container =
            getContainer();

        const element =
            document.createElement(
                "section"
            );

        element.className =
            "tactic-notification";

        element.dataset.level =
            record.level;

        element.dataset.notificationId =
            String(record.id);

        element.setAttribute(
            "role",
            record.level ===
                LEVELS.ERROR
                ? "alert"
                : "status"
        );

        const icon =
            document.createElement(
                "div"
            );

        icon.className =
            "tactic-notification__icon";

        icon.textContent =
            ICONS[
                record.level
            ];

        const content =
            document.createElement(
                "div"
            );

        content.className =
            "tactic-notification__content";

        const title =
            document.createElement(
                "h4"
            );

        title.className =
            "tactic-notification__title";

        title.textContent =
            record.title;

        const message =
            document.createElement(
                "p"
            );

        message.className =
            "tactic-notification__message";

        message.textContent =
            record.message;

        content.append(
            title,
            message
        );

        const controls =
            document.createElement(
                "div"
            );

        controls.className =
            "tactic-notification__controls";

        if (
            record.actionLabel &&
            record.onAction
        ) {
            const action =
                document.createElement(
                    "button"
                );

            action.type =
                "button";

            action.className =
                "tactic-notification__action";

            action.textContent =
                record.actionLabel;

            action.addEventListener(
                "click",
                () => {
                    record.actionTriggered =
                        true;

                    invokeCallback(
                        "action",
                        record.onAction,
                        record
                    );

                    events?.emit(
                        EVENTS.NOTIFICATION
                            .CLICKED,
                        {
                            notification:
                                createPublicSnapshot(
                                    record
                                ),

                            action:
                                true,
                        }
                    );
                }
            );

            controls.appendChild(
                action
            );
        }

        if (
            record.dismissible
        ) {
            const dismissButton =
                document.createElement(
                    "button"
                );

            dismissButton.type =
                "button";

            dismissButton.className =
                "tactic-notification__dismiss";

            dismissButton.setAttribute(
                "aria-label",
                "Dismiss notification"
            );

            dismissButton.textContent =
                "×";

            dismissButton.addEventListener(
                "click",
                () => {
                    dismiss(
                        record.id,
                        "manual"
                    );
                }
            );

            controls.appendChild(
                dismissButton
            );
        }

        element.append(
            icon,
            content,
            controls
        );

        record.element =
            element;

        record.displayedAt =
            Date.now();

        container.appendChild(
            element
        );

        requestAnimationFrame(
            () => {
                element.dataset.visible =
                    "true";
            }
        );

        if (
            record.durationMs > 0
        ) {
            record.timeoutHandle =
                setTimeout(
                    () => {
                        dismiss(
                            record.id,
                            "automatic"
                        );
                    },
                    record.durationMs
                );
        }
    }

    function logNotification(
        record
    ) {
        const context = {
            notificationId:
                record.id,

            group:
                record.group,

            source:
                record.source,

            metadata:
                record.metadata,
        };

        switch (
            record.level
        ) {
            case LEVELS.SUCCESS:
                logger?.info(
                    `${record.title}: ${record.message}`,
                    context
                );
                break;

            case LEVELS.WARNING:
                logger?.warn(
                    `${record.title}: ${record.message}`,
                    context
                );
                break;

            case LEVELS.ERROR:
                logger?.error(
                    `${record.title}: ${record.message}`,
                    context
                );
                break;

            case LEVELS.INFO:
            default:
                logger?.info(
                    `${record.title}: ${record.message}`,
                    context
                );
                break;
        }
    }

    function show(
        messageOrOptions,
        options = {}
    ) {
        const suppliedOptions =
            typeof messageOrOptions ===
                "object" &&
            messageOrOptions !==
                null &&
            !Array.isArray(
                messageOrOptions
            )
                ? {
                      ...messageOrOptions,
                  }
                : {
                      ...options,

                      message:
                          messageOrOptions,
                  };

        const normalized =
            normalizeOptions(
                suppliedOptions
            );

        if (
            !normalized.message
        ) {
            throw new TypeError(
                "Notification message must be a non-empty string."
            );
        }

        const duplicate =
            findDuplicate(
                normalized
            );

        if (duplicate) {
            metrics.duplicatesSuppressed +=
                1;

            recordActivity(
                "duplicate-suppressed",
                duplicate
            );

            return createPublicSnapshot(
                duplicate
            );
        }

        const record =
            createNotificationRecord(
                normalized
            );

        activeNotifications.set(
            record.id,
            record
        );

        notificationHistory.push(
            record
        );

        trimHistory();

        metrics.shown +=
            1;

        metrics.byLevel[
            record.level
        ] += 1;

        metrics.activePeak =
            Math.max(
                metrics.activePeak,
                activeNotifications.size
            );

        try {
            renderNotification(
                record
            );

            logNotification(
                record
            );

            events?.emit(
                EVENTS.NOTIFICATION
                    .CREATED,
                {
                    notification:
                        createPublicSnapshot(
                            record
                        ),
                }
            );

            recordActivity(
                "show",
                record
            );

            return createPublicSnapshot(
                record
            );
        } catch (error) {
            activeNotifications.delete(
                record.id
            );

            record.active =
                false;

            record.dismissedAt =
                Date.now();

            record.dismissReason =
                "render-failed";

            errors?.report({
                code:
                    ERROR_CODES
                        .NOTIFICATION
                        .FAILED,

                severity:
                    SEVERITY.ERROR,

                service:
                    "notifications",

                message:
                    "Notification could not be displayed.",

                details: {
                    notificationId:
                        record.id,

                    level:
                        record.level,

                    title:
                        record.title,
                },

                error,

                recoverable:
                    true,

                retryable:
                    true,

                recovery:
                    "Retry after the document body becomes available.",
            });

            events?.emit(
                EVENTS.NOTIFICATION
                    .FAILED,
                {
                    notification:
                        createPublicSnapshot(
                            record
                        ),

                    error,
                }
            );

            throw error;
        }
    }

    function info(
        message,
        options = {}
    ) {
        return show(
            message,
            {
                ...options,

                level:
                    LEVELS.INFO,
            }
        );
    }

    function success(
        message,
        options = {}
    ) {
        return show(
            message,
            {
                ...options,

                level:
                    LEVELS.SUCCESS,
            }
        );
    }

    function warning(
        message,
        options = {}
    ) {
        return show(
            message,
            {
                ...options,

                level:
                    LEVELS.WARNING,
            }
        );
    }

    function errorNotification(
        message,
        options = {}
    ) {
        return show(
            message,
            {
                ...options,

                level:
                    LEVELS.ERROR,

                durationMs:
                    options.durationMs ??
                    8000,
            }
        );
    }

    function dismiss(
        notificationId,
        reason = "manual"
    ) {
        const id =
            Number(
                notificationId
            );

        if (
            !Number.isSafeInteger(
                id
            )
        ) {
            return false;
        }

        const record =
            activeNotifications.get(
                id
            );

        if (!record) {
            return false;
        }

        activeNotifications.delete(
            id
        );

        if (
            record.timeoutHandle !==
            null
        ) {
            clearTimeout(
                record.timeoutHandle
            );

            record.timeoutHandle =
                null;
        }

        record.active =
            false;

        record.dismissedAt =
            Date.now();

        record.dismissReason =
            String(reason);

        metrics.dismissed +=
            1;

        if (
            reason === "automatic"
        ) {
            metrics.automaticallyDismissed +=
                1;
        } else {
            metrics.manuallyDismissed +=
                1;
        }

        const element =
            record.element;

        if (element) {
            element.dataset.visible =
                "false";

            setTimeout(
                () => {
                    element.remove();
                },
                180
            );
        }

        invokeCallback(
            "dismiss",
            record.onDismiss,
            record
        );

        recordActivity(
            "dismiss",
            record
        );

        return true;
    }

    function clear(
        filters = {}
    ) {
        let records = [
            ...activeNotifications.values(),
        ];

        if (filters.level) {
            const level =
                normalizeLevel(
                    filters.level
                );

            records =
                records.filter(
                    (record) =>
                        record.level ===
                        level
                );
        }

        if (filters.group) {
            records =
                records.filter(
                    (record) =>
                        record.group ===
                        filters.group
                );
        }

        for (
            const record of records
        ) {
            dismiss(
                record.id,
                "cleared"
            );
        }

        metrics.cleared +=
            records.length;

        recordActivity(
            "clear"
        );

        return records.length;
    }

    function get(
        notificationId
    ) {
        const id =
            Number(
                notificationId
            );

        if (
            !Number.isSafeInteger(
                id
            )
        ) {
            return null;
        }

        const active =
            activeNotifications.get(
                id
            );

        if (active) {
            return createPublicSnapshot(
                active
            );
        }

        const historical =
            notificationHistory.find(
                (record) =>
                    record.id === id
            );

        return createPublicSnapshot(
            historical
        );
    }

    function latest() {
        return createPublicSnapshot(
            notificationHistory[
                notificationHistory.length -
                    1
            ] || null
        );
    }

    function history(
        filters = {}
    ) {
        let records = [
            ...notificationHistory,
        ];

        if (filters.level) {
            const level =
                normalizeLevel(
                    filters.level
                );

            records =
                records.filter(
                    (record) =>
                        record.level ===
                        level
                );
        }

        if (filters.group) {
            records =
                records.filter(
                    (record) =>
                        record.group ===
                        filters.group
                );
        }

        if (
            filters.active !==
            undefined
        ) {
            records =
                records.filter(
                    (record) =>
                        record.active ===
                        Boolean(
                            filters.active
                        )
                );
        }

        if (
            Number.isSafeInteger(
                filters.limit
            ) &&
            filters.limit > 0
        ) {
            records =
                records.slice(
                    -filters.limit
                );
        }

        return records.map(
            createPublicSnapshot
        );
    }

    function count(
        filters = {}
    ) {
        if (
            Object.keys(
                filters
            ).length === 0
        ) {
            return activeNotifications.size;
        }

        return history(
            filters
        ).length;
    }

    function inspect() {
        return {
            service:
                "notifications",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            activeCount:
                activeNotifications.size,

            historyCount:
                notificationHistory.length,

            containerAvailable:
                Boolean(
                    document.getElementById(
                        CONTAINER_ID
                    )
                ),

            styleAvailable:
                Boolean(
                    document.getElementById(
                        STYLE_ID
                    )
                ),

            metrics: {
                ...metrics,

                byLevel: {
                    ...metrics.byLevel,
                },
            },

            defaults: {
                durationMs:
                    DEFAULT_DURATION_MS,

                duplicateWindowMs:
                    DEFAULT_DUPLICATE_WINDOW_MS,

                maxHistory:
                    MAX_HISTORY,
            },

            levels: {
                ...LEVELS,
            },

            active:
                [
                    ...activeNotifications
                        .values(),
                ].map(
                    createPublicSnapshot
                ),
        };
    }

    TACTIC.services.notifications = {
        show,

        info,
        success,
        warning,

        error:
            errorNotification,

        dismiss,
        clear,

        get,
        latest,
        history,
        count,

        inspect,

        levels:
            LEVELS,
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
                "notifications",

            deliveryMethods: [
                "toast",
                "logger",
            ],

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Notification service loaded"
    );
})();