(() => {
    "use strict";

    const TACTIC = globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Events] Namespace is unavailable."
        );
        return;
    }

    const listeners = new Map();

    function on(eventName, handler) {
        if (typeof handler !== "function") {
            throw new TypeError(
                "Event handler must be a function."
            );
        }

        if (!listeners.has(eventName)) {
            listeners.set(
                eventName,
                new Set()
            );
        }

        listeners
            .get(eventName)
            .add(handler);

        /*
         * Return an unsubscribe function.
         */
        return () => {
            off(eventName, handler);
        };
    }

    function once(eventName, handler) {
        const unsubscribe = on(
            eventName,
            (payload) => {
                unsubscribe();
                handler(payload);
            }
        );

        return unsubscribe;
    }

    function off(eventName, handler) {
        const eventListeners =
            listeners.get(eventName);

        if (!eventListeners) {
            return false;
        }

        const removed =
            eventListeners.delete(handler);

        if (
            eventListeners.size === 0
        ) {
            listeners.delete(eventName);
        }

        return removed;
    }

    function emit(eventName, payload) {
        const eventListeners =
            listeners.get(eventName);

        if (!eventListeners) {
            return 0;
        }

        let executed = 0;

        /*
         * Copy the set so handlers can unsubscribe safely
         * while an event is being emitted.
         */
        for (
            const handler of
            [...eventListeners]
        ) {
            try {
                handler(payload);
                executed += 1;
            } catch (error) {
                console.error(
                    `[TACTIC Events] Handler failed for "${eventName}"`,
                    error
                );
            }
        }

        return executed;
    }

    function listenerCount(eventName) {
        return (
            listeners.get(eventName)
                ?.size || 0
        );
    }

    function clear(eventName = null) {
        if (eventName === null) {
            listeners.clear();
            return;
        }

        listeners.delete(eventName);
    }

    TACTIC.services.events = {
        on,
        once,
        off,
        emit,
        listenerCount,
        clear,
    };

    console.log(
        "[TACTIC Events] Service loaded"
    );
})();