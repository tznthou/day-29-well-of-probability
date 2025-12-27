/**
 * Global State Management
 * 全域狀態物件，用於 Plotly 與 D3 即時同步
 */

export const state = {
    // Current selections
    lotteryType: 'lotto', // 'lotto' | 'super'
    year: 'all',          // '2024' | '2025' | 'all'
    gapRange: 'merged',   // 'single' | 'merged'

    // Loaded data
    data: {
        lotto: { 2024: null, 2025: null },
        super: { 2024: null, 2025: null }
    },

    // Computed statistics
    stats: {
        frequency: {},      // { number: count }
        specialFrequency: {}, // { number: count } for special/second zone
        zScores: {},        // { number: zScore }
        gaps: {},           // { number: gapPeriods }
        mean: 0,
        stdDev: 0
    },

    // Selected number (for cross-engine interaction)
    selectedNumber: null,

    // Selected pair (for fate partners)
    selectedPair: null, // { num1, num2 }

    // Subscribers for state changes
    _subscribers: [],

    // Notification loop protection
    _isNotifying: false,
    _pendingNotifications: new Set(),

    /**
     * Subscribe to state changes
     */
    subscribe(callback) {
        this._subscribers.push(callback);
        return () => {
            this._subscribers = this._subscribers.filter(cb => cb !== callback);
        };
    },

    /**
     * Notify all subscribers (with circular reference protection)
     */
    notify(changeType) {
        // Prevent infinite loops: queue notification if already notifying
        if (this._isNotifying) {
            this._pendingNotifications.add(changeType);
            return;
        }

        this._isNotifying = true;

        try {
            this._subscribers.forEach(cb => {
                try {
                    cb(changeType, this);
                } catch (error) {
                    console.error('State subscriber error:', error);
                }
            });
        } finally {
            this._isNotifying = false;
        }

        // Process any queued notifications
        if (this._pendingNotifications.size > 0) {
            const pending = Array.from(this._pendingNotifications);
            this._pendingNotifications.clear();
            pending.forEach(type => this.notify(type));
        }
    },

    /**
     * Update state and notify
     */
    update(key, value) {
        if (this[key] !== value) {
            this[key] = value;
            this.notify(key);
        }
    },

    /**
     * Set selected number (for highlighting)
     */
    setSelectedNumber(num) {
        this.selectedNumber = num;
        this.notify('selection');
    },

    /**
     * Clear selection
     */
    clearSelection() {
        this.selectedNumber = null;
        this.selectedPair = null;
        this.notify('selection');
    },

    /**
     * Set selected pair (for fate partners)
     */
    setSelectedPair(num1, num2) {
        this.selectedNumber = null;
        this.selectedPair = { num1, num2 };
        this.notify('pairSelection');
    }
};
