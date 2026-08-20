(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Drawer] Namespace is unavailable."
        );

        return;
    }

    const storage =
        TACTIC.services.storage;

    const events =
        TACTIC.services.events;

    const logger =
        TACTIC.services.logger;

    const components =
        TACTIC.services.components;

    const DRAWER_OPEN_KEY =
        "ui:drawer-open";

    const ACTIVE_MODULE_KEY =
        "ui:active-module";

    let edgeTab = null;
    let drawer = null;
    let navigation = null;
    let content = null;
    let statusIcon = null;

    function injectStyles() {
        if (
            document.getElementById(
                "tactic-modular-styles"
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                "style"
            );

        style.id =
            "tactic-modular-styles";

        style.textContent = `
            #tactic-modular-tab,
            #tactic-modular-drawer,
            #tactic-modular-drawer * {
                box-sizing: border-box;
                font-family: Arial, sans-serif;
            }

            #tactic-modular-tab {
                position: fixed;
                right: 0;
                top: 45%;
                z-index: 1000001;

                display: flex;
                align-items: center;
                gap: 6px;

                padding: 10px 8px;

                border: 1px solid #666;
                border-right: none;
                border-radius: 8px 0 0 8px;

                background: rgba(25, 25, 25, .97);
                color: #fff;

                font-size: 12px;
                font-weight: 700;

                cursor: pointer;

                writing-mode: vertical-rl;
                text-orientation: mixed;

                box-shadow:
                    -3px 3px 12px
                    rgba(0, 0, 0, .4);

                transition:
                    right .25s ease,
                    background .15s ease;
            }

            #tactic-modular-tab:hover {
                background:
                    rgba(45, 45, 45, .98);
            }

            #tactic-modular-drawer {
                position: fixed;
                top: 0;
                right: 0;
                z-index: 1000000;

                width: 420px;
                max-width: 92vw;
                height: 100vh;

                color: #fff;
                background:
                    rgba(20, 20, 20, .99);

                border-left:
                    1px solid #555;

                box-shadow:
                    -8px 0 28px
                    rgba(0, 0, 0, .5);

                transform:
                    translateX(100%);

                transition:
                    transform .25s ease;

                overflow: hidden;
            }

            #tactic-modular-header {
                height: 64px;

                display: flex;
                align-items: center;
                justify-content:
                    space-between;

                padding: 12px 14px;

                border-bottom:
                    1px solid
                    rgba(255, 255, 255, .14);

                background:
                    rgba(32, 32, 32, .99);
            }

            .tactic-modular-title {
                font-size: 19px;
                font-weight: 800;
                letter-spacing: .6px;
            }

            .tactic-modular-subtitle {
                margin-top: 2px;

                color: #aaa;
                font-size: 11px;
            }

            .tactic-modular-close {
                width: 32px;
                height: 32px;
                padding: 0;

                border:
                    1px solid #666;

                border-radius: 5px;

                background: #292929;
                color: #fff;

                cursor: pointer;
                font-size: 15px;
            }

            #tactic-modular-body {
                display: grid;

                grid-template-columns:
                    145px minmax(0, 1fr);

                height:
                    calc(100vh - 64px);
            }

            #tactic-modular-navigation {
                padding: 10px 8px;

                border-right:
                    1px solid
                    rgba(255, 255, 255, .12);

                background:
                    rgba(27, 27, 27, .99);

                overflow-y: auto;
            }

            .tactic-nav-button {
                display: flex;
                align-items: center;
                gap: 8px;

                width: 100%;
                margin: 0 0 5px;
                padding: 9px 8px;

                border:
                    1px solid transparent;

                border-radius: 5px;

                background: transparent;
                color: #bbb;

                text-align: left;
                cursor: pointer;

                font-size: 12px;
            }

            .tactic-nav-button:hover {
                background:
                    rgba(255, 255, 255, .06);

                color: #fff;
            }

            .tactic-nav-button.active {
                background:
                    rgba(255, 255, 255, .10);

                border-color:
                    rgba(255, 255, 255, .18);

                color: #fff;
            }

            .tactic-nav-button.error {
                color: #ff8f8f;
            }

            #tactic-modular-content {
                min-width: 0;
                padding: 16px;

                overflow-y: auto;
            }

            .tactic-page-heading {
                margin: 0 0 14px;

                font-size: 18px;
                color: #fff;
            }

            .tactic-info-card {
                padding: 11px 12px;

                border:
                    1px solid
                    rgba(255, 255, 255, .14);

                border-radius: 7px;

                background:
                    rgba(255, 255, 255, .04);
            }

            .tactic-info-card-label {
                color: #aaa;

                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: .4px;
            }

            .tactic-info-card-value {
                margin-top: 4px;

                font-size: 16px;
                font-weight: 700;
            }

            .tactic-empty-state {
                padding: 16px;

                border:
                    1px solid
                    rgba(255, 255, 255, .14);

                border-radius: 7px;

                background:
                    rgba(255, 255, 255, .035);
            }

            .tactic-empty-state-title {
                font-weight: 700;
                color: #fff;
            }

            .tactic-empty-state-description {
                margin-top: 6px;

                color: #aaa;
                line-height: 1.5;
            }

            .tactic-primary-button {
                width: 100%;
                margin-top: 8px;
                padding: 10px;

                border: 1px solid #666;
                border-radius: 5px;

                background: #303030;
                color: #fff;

                cursor: pointer;
            }

            .tactic-primary-button:hover {
                background: #3a3a3a;
            }

            /* ============================================================
               Tools
               ============================================================ */

            .tactic-tools-content {
                display: flex;
                flex-direction: column;
                gap: 12px;
                min-width: 0;
            }

            .tactic-tools-section {
                min-width: 0;
            }

            .tactic-tool-card {
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 12px;
                border: 1px solid rgba(128, 128, 128, 0.28);
                border-radius: 8px;
                box-sizing: border-box;
            }

            .tactic-tool-title {
                font-size: 14px;
                font-weight: 700;
            }

            .tactic-tool-description {
                font-size: 11px;
                line-height: 1.4;
                opacity: 0.72;
            }

            .tactic-tool-setting-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }

            .tactic-tool-setting-label {
                min-width: 0;
                font-size: 11px;
                font-weight: 600;
            }

            .tactic-tool-number-wrap {
                display: flex;
                align-items: center;
                gap: 5px;
                flex: 0 0 auto;
            }

            .tactic-tool-number-input {
                width: 60px;
                box-sizing: border-box;
            }

            .tactic-tool-status {
                display: flex;
                flex-direction: column;
                gap: 2px;
                padding: 8px;
                border-radius: 6px;
                background: rgba(128, 128, 128, 0.08);
                font-size: 10px;
                line-height: 1.35;
            }

            .tactic-tool-primary-button {
                width: 100%;
                font-weight: 700;
            }

            .tactic-tool-result {
                font-size: 10px;
                text-align: center;
                opacity: 0.72;
            }
        `;

        document.head.appendChild(
            style
        );
    }

    function isOpen() {
        return storage.get(
            DRAWER_OPEN_KEY,
            false
        );
    }

    function setOpen(open) {
        const normalized =
            Boolean(open);

        storage.set(
            DRAWER_OPEN_KEY,
            normalized
        );

        updatePosition();

        events.emit(
            normalized
                ? "ui:drawer-opened"
                : "ui:drawer-closed"
        );
    }

    function toggle() {
        setOpen(!isOpen());
    }

    function getActiveModuleId() {
        return storage.get(
            ACTIVE_MODULE_KEY,
            null
        );
    }

    function chooseDefaultModule() {
        const modules =
            TACTIC.getModules();

        if (modules.length === 0) {
            return null;
        }

        const current =
            getActiveModuleId();

        if (
            current &&
            TACTIC.hasModule(current)
        ) {
            return current;
        }

        const firstModule =
            modules[0];

        storage.set(
            ACTIVE_MODULE_KEY,
            firstModule.id
        );

        return firstModule.id;
    }

    async function setActiveModule(
        moduleId
    ) {
        if (
            !TACTIC.hasModule(
                moduleId
            )
        ) {
            logger.warn(
                `Cannot activate unknown module: ${moduleId}`
            );

            return false;
        }

        storage.set(
            ACTIVE_MODULE_KEY,
            moduleId
        );

        await renderNavigation();
        await renderActiveModule();

        events.emit(
            "ui:active-module-changed",
            {
                moduleId,
            }
        );

        return true;
    }

    function updatePosition() {
        if (!drawer || !edgeTab) {
            return;
        }

        const open = isOpen();

        drawer.style.transform =
            open
                ? "translateX(0)"
                : "translateX(100%)";

        edgeTab.style.right =
            open
                ? `${
                      TACTIC.config.ui
                          .drawerWidthPx
                  }px`
                : "0";

        edgeTab.setAttribute(
            "aria-expanded",
            String(open)
        );
    }

    function updateStatus(
        icon = "🟢",
        label = "TACTIC ready"
    ) {
        if (statusIcon) {
            statusIcon.textContent =
                icon;
        }

        if (edgeTab) {
            edgeTab.title =
                `TACTIC — ${label}`;
        }
    }

    async function renderNavigation() {
        if (!navigation) {
            return;
        }

        navigation.replaceChildren();

        const modules =
            TACTIC.getModules();

        const activeModuleId =
            chooseDefaultModule();

        if (modules.length === 0) {
            navigation.appendChild(
                components.createElement(
                    "div",
                    {
                        text:
                            "No modules registered.",

                        styles: {
                            color: "#888",
                            padding: "10px 8px",
                            fontSize: "11px",
                            lineHeight: "1.4",
                        },
                    }
                )
            );

            return;
        }

        for (
            const module of modules
        ) {
            const button =
                components.createButton(
                    "",
                    {
                        className:
                            "tactic-nav-button",

                        attributes: {
                            title:
                                module.name,
                        },

                        onClick: () => {
                            setActiveModule(
                                module.id
                            );
                        },
                    }
                );

            if (
                module.id ===
                activeModuleId
            ) {
                button.classList.add(
                    "active"
                );
            }

            if (module.error) {
                button.classList.add(
                    "error"
                );
            }

            button.append(
                components.createElement(
                    "span",
                    {
                        text:
                            module.icon,
                    }
                ),

                components.createElement(
                    "span",
                    {
                        text:
                            module.name,
                    }
                )
            );

            navigation.appendChild(
                button
            );
        }
    }

    async function renderActiveModule() {
        if (!content) {
            return;
        }

        content.replaceChildren();

        const moduleId =
            chooseDefaultModule();

        if (!moduleId) {
            content.appendChild(
                components.createEmptyState(
                    "No modules available",
                    "TACTIC is running, but no feature modules have been registered."
                )
            );

            return;
        }

        const module =
            TACTIC.getModule(
                moduleId
            );

        if (!module) {
            content.appendChild(
                components.createEmptyState(
                    "Module unavailable",
                    `The module "${moduleId}" is no longer registered.`
                )
            );

            return;
        }

        try {
            if (!module.initialized) {
                await TACTIC.initializeModule(
                    module.id
                );
            }

            await module.render(
                content,
                {
                    TACTIC,
                    module,
                    services:
                        TACTIC.services,
                    events,
                    logger,
                    components,
                }
            );

            events.emit(
                "ui:module-rendered",
                {
                    moduleId:
                        module.id,
                }
            );
        } catch (error) {
            logger.error(
                `Module render failed: ${module.id}`,
                {
                    message:
                        error.message,

                    stack:
                        error.stack,
                }
            );

            content.replaceChildren(
                components.createEmptyState(
                    "Module error",
                    error.message
                )
            );

            updateStatus(
                "🔴",
                "Module error"
            );
        }

        await renderNavigation();
    }

    function createInterface() {
        injectStyles();

        document
            .getElementById(
                "tactic-modular-tab"
            )
            ?.remove();

        document
            .getElementById(
                "tactic-modular-drawer"
            )
            ?.remove();

        edgeTab =
            components.createButton(
                "",
                {
                    id:
                        "tactic-modular-tab",

                    attributes: {
                        "aria-label":
                            "Open TACTIC",

                        "aria-expanded":
                            "false",
                    },

                    onClick:
                        toggle,
                }
            );

        statusIcon =
            components.createElement(
                "span",
                {
                    text: "🟢",
                }
            );

        edgeTab.append(
            statusIcon,

            components.createElement(
                "span",
                {
                    text: "TACTIC",
                }
            )
        );

        drawer =
            components.createElement(
                "aside",
                {
                    id:
                        "tactic-modular-drawer",
                }
            );

        const header =
            components.createElement(
                "header",
                {
                    id:
                        "tactic-modular-header",
                }
            );

        const titleWrapper =
            components.createElement(
                "div"
            );

        titleWrapper.append(
            components.createElement(
                "div",
                {
                    className:
                        "tactic-modular-title",

                    text: "TACTIC",
                }
            ),

            components.createElement(
                "div",
                {
                    className:
                        "tactic-modular-subtitle",

                    text:
                        "Torn Assistant & Companion Toolkit",
                }
            )
        );

        const closeButton =
            components.createButton(
                "✕",
                {
                    className:
                        "tactic-modular-close",

                    attributes: {
                        "aria-label":
                            "Close TACTIC",
                    },

                    onClick: () => {
                        setOpen(false);
                    },
                }
            );

        header.append(
            titleWrapper,
            closeButton
        );

        const body =
            components.createElement(
                "div",
                {
                    id:
                        "tactic-modular-body",
                }
            );

        navigation =
            components.createElement(
                "nav",
                {
                    id:
                        "tactic-modular-navigation",
                }
            );

        content =
            components.createElement(
                "main",
                {
                    id:
                        "tactic-modular-content",
                }
            );

        body.append(
            navigation,
            content
        );

        drawer.append(
            header,
            body
        );

        document.body.append(
            drawer,
            edgeTab
        );

        updatePosition();
        updateStatus();

        logger.info(
            "TACTIC drawer created"
        );
    }

    async function refresh() {
        await renderNavigation();
        await renderActiveModule();
        updatePosition();
    }

    async function initialize() {
        createInterface();

        await renderNavigation();
        await renderActiveModule();

        events.on(
            "module:registered",
            refresh
        );

        events.on(
            "module:unregistered",
            refresh
        );

        events.on(
            "module:initialized",
            renderNavigation
        );

        events.on(
            "module:error",
            async () => {
                updateStatus(
                    "🔴",
                    "Module error"
                );

                await refresh();
            }
        );

        events.on(
            "app:ready",
            () => {
                updateStatus(
                    "🟢",
                    "Ready"
                );
            }
        );
    }

    TACTIC.services.drawer = {
        initialize,
        refresh,
        isOpen,
        setOpen,
        toggle,
        getActiveModuleId,
        setActiveModule,
        updateStatus,
        renderNavigation,
        renderActiveModule,
    };

    logger.info(
        "Drawer service loaded"
    );
})();