/**
 * Unit tests for state.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { state } from '../js/state.js';

describe('state', () => {
    beforeEach(() => {
        // Reset state to initial values
        state.lotteryType = 'lotto';
        state.year = 'all';
        state.gapRange = 'merged';
        state.selectedNumber = null;
        state.selectedPair = null;
        state._subscribers = [];
        state._isNotifying = false;
        state._pendingNotifications.clear();
    });

    describe('subscribe', () => {
        it('should add callback to subscribers', () => {
            const callback = vi.fn();
            state.subscribe(callback);

            expect(state._subscribers).toContain(callback);
        });

        it('should return unsubscribe function', () => {
            const callback = vi.fn();
            const unsubscribe = state.subscribe(callback);

            expect(typeof unsubscribe).toBe('function');

            unsubscribe();
            expect(state._subscribers).not.toContain(callback);
        });
    });

    describe('notify', () => {
        it('should call all subscribers with changeType and state', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            state.subscribe(callback1);
            state.subscribe(callback2);

            state.notify('test');

            expect(callback1).toHaveBeenCalledWith('test', state);
            expect(callback2).toHaveBeenCalledWith('test', state);
        });

        it('should catch and log subscriber errors', () => {
            const errorCallback = vi.fn(() => {
                throw new Error('Test error');
            });
            const normalCallback = vi.fn();

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            state.subscribe(errorCallback);
            state.subscribe(normalCallback);

            state.notify('test');

            // Error should be caught, not thrown
            expect(normalCallback).toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('should prevent infinite loops when notify is called during notification', () => {
            let callCount = 0;
            const recursiveCallback = vi.fn(() => {
                callCount++;
                if (callCount < 10) {
                    state.notify('recursive');
                }
            });

            state.subscribe(recursiveCallback);
            state.notify('initial');

            // Should queue notifications, not recurse infinitely
            expect(callCount).toBeLessThan(20);
        });
    });

    describe('update', () => {
        it('should update value and notify when value changes', () => {
            const callback = vi.fn();
            state.subscribe(callback);

            state.update('lotteryType', 'super');

            expect(state.lotteryType).toBe('super');
            expect(callback).toHaveBeenCalledWith('lotteryType', state);
        });

        it('should not notify when value is unchanged', () => {
            const callback = vi.fn();
            state.subscribe(callback);

            state.update('lotteryType', 'lotto'); // Same as initial

            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('setSelectedNumber', () => {
        it('should set selectedNumber and notify selection', () => {
            const callback = vi.fn();
            state.subscribe(callback);

            state.setSelectedNumber(42);

            expect(state.selectedNumber).toBe(42);
            expect(callback).toHaveBeenCalledWith('selection', state);
        });
    });

    describe('clearSelection', () => {
        it('should clear both selectedNumber and selectedPair', () => {
            state.selectedNumber = 42;
            state.selectedPair = { num1: 1, num2: 2 };

            const callback = vi.fn();
            state.subscribe(callback);

            state.clearSelection();

            expect(state.selectedNumber).toBeNull();
            expect(state.selectedPair).toBeNull();
            expect(callback).toHaveBeenCalledWith('selection', state);
        });
    });

    describe('setSelectedPair', () => {
        it('should set selectedPair and clear selectedNumber', () => {
            state.selectedNumber = 42;

            const callback = vi.fn();
            state.subscribe(callback);

            state.setSelectedPair(1, 2);

            expect(state.selectedNumber).toBeNull();
            expect(state.selectedPair).toEqual({ num1: 1, num2: 2 });
            expect(callback).toHaveBeenCalledWith('pairSelection', state);
        });
    });
});
