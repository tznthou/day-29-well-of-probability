/**
 * Unit tests for dataController.js
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../js/state.js';
import {
    LOTTERY_RANGES,
    MAIN_NUMBERS_PER_DRAW,
    Z_SCORE_THRESHOLD,
    getNumberRange,
    getStatus,
    calculateStats,
    getComparisonData,
    calculateCoOccurrence
} from '../js/dataController.js';

describe('dataController', () => {
    // Sample test data
    const sampleData = [
        { '期別': '113000001', '開獎日期': '2024/01/01', '獎號1': '1', '獎號2': '2', '獎號3': '3', '獎號4': '4', '獎號5': '5', '獎號6': '6', '特別號': '7' },
        { '期別': '113000002', '開獎日期': '2024/01/02', '獎號1': '1', '獎號2': '8', '獎號3': '9', '獎號4': '10', '獎號5': '11', '獎號6': '12', '特別號': '13' },
        { '期別': '113000003', '開獎日期': '2024/01/03', '獎號1': '1', '獎號2': '2', '獎號3': '14', '獎號4': '15', '獎號5': '16', '獎號6': '17', '特別號': '18' }
    ];

    beforeEach(() => {
        // Reset state
        state.lotteryType = 'lotto';
        state.year = 'all';
        state.gapRange = 'merged';
        state.data = {
            lotto: { 2024: sampleData, 2025: [] },
            super: { 2024: [], 2025: [] }
        };
    });

    describe('constants', () => {
        it('should have correct lottery ranges', () => {
            expect(LOTTERY_RANGES.lotto).toEqual({ main: 49, special: 49 });
            expect(LOTTERY_RANGES.super).toEqual({ main: 38, special: 8 });
        });

        it('should have 6 main numbers per draw', () => {
            expect(MAIN_NUMBERS_PER_DRAW).toBe(6);
        });

        it('should have Z-Score threshold of 2', () => {
            expect(Z_SCORE_THRESHOLD).toBe(2);
        });
    });

    describe('getNumberRange', () => {
        it('should return lotto range for lotto type', () => {
            state.lotteryType = 'lotto';
            const range = getNumberRange();

            expect(range).toEqual({ main: 49, special: 49 });
        });

        it('should return super range for super type', () => {
            state.lotteryType = 'super';
            const range = getNumberRange();

            expect(range).toEqual({ main: 38, special: 8 });
        });
    });

    describe('getStatus', () => {
        it('should return favorites for Z-Score > 2', () => {
            const status = getStatus(2.5);

            expect(status.label).toBe('天選之子');
            expect(status.class).toBe('favorites');
        });

        it('should return outcasts for Z-Score < -2', () => {
            const status = getStatus(-2.5);

            expect(status.label).toBe('被遺忘者');
            expect(status.class).toBe('outcasts');
        });

        it('should return normal for Z-Score between -2 and 2', () => {
            const status = getStatus(0);

            expect(status.label).toBe('常態');
            expect(status.class).toBe('normal');
        });

        it('should return normal for boundary values', () => {
            expect(getStatus(2).class).toBe('normal');
            expect(getStatus(-2).class).toBe('normal');
        });
    });

    describe('calculateStats', () => {
        it('should calculate frequency correctly', () => {
            const stats = calculateStats();

            // Number 1 appears in all 3 draws
            expect(stats.frequency[1]).toBe(3);

            // Number 2 appears in 2 draws
            expect(stats.frequency[2]).toBe(2);

            // Number 49 never appears
            expect(stats.frequency[49]).toBe(0);
        });

        it('should calculate special frequency for lotto', () => {
            const stats = calculateStats();

            expect(stats.specialFrequency[7]).toBe(1);
            expect(stats.specialFrequency[13]).toBe(1);
            expect(stats.specialFrequency[18]).toBe(1);
        });

        it('should calculate mean and stdDev', () => {
            const stats = calculateStats();

            expect(stats.mean).toBeGreaterThan(0);
            expect(stats.stdDev).toBeGreaterThanOrEqual(0);
        });

        it('should calculate Z-scores', () => {
            const stats = calculateStats();

            // Number 1 appears most (3 times), should have positive Z-score
            expect(stats.zScores[1]).toBeGreaterThan(0);

            // Numbers that never appear should have negative Z-score
            expect(stats.zScores[49]).toBeLessThan(0);
        });

        it('should count total draws', () => {
            const stats = calculateStats();

            expect(stats.totalDraws).toBe(3);
        });

        it('should handle empty data', () => {
            state.data = {
                lotto: { 2024: [], 2025: [] },
                super: { 2024: [], 2025: [] }
            };

            const stats = calculateStats();

            expect(stats.totalDraws).toBe(0);
            expect(stats.mean).toBe(0);
        });
    });

    describe('getComparisonData', () => {
        beforeEach(() => {
            state.data = {
                lotto: {
                    2024: [
                        { '期別': '113000001', '獎號1': '1', '獎號2': '2', '獎號3': '3', '獎號4': '4', '獎號5': '5', '獎號6': '6', '特別號': '7' }
                    ],
                    2025: [
                        { '期別': '114000001', '獎號1': '1', '獎號2': '10', '獎號3': '20', '獎號4': '30', '獎號5': '40', '獎號6': '49', '特別號': '25' }
                    ]
                },
                super: { 2024: [], 2025: [] }
            };
        });

        it('should return frequency data for both years', () => {
            const data = getComparisonData();

            expect(data.freq2024[1]).toBe(1);
            expect(data.freq2024[2]).toBe(1);
            expect(data.freq2025[1]).toBe(1);
            expect(data.freq2025[49]).toBe(1);
        });

        it('should return draw counts for both years', () => {
            const data = getComparisonData();

            expect(data.draws2024).toBe(1);
            expect(data.draws2025).toBe(1);
        });
    });

    describe('calculateCoOccurrence', () => {
        it('should calculate co-occurrence matrix', () => {
            const result = calculateCoOccurrence();

            // Numbers 1 and 2 appear together in 2 draws (draw 1 and 3)
            expect(result.matrix[1][2]).toBe(2);
            expect(result.matrix[2][1]).toBe(2); // Symmetric

            // Numbers 1 and 8 appear together in 1 draw (draw 2)
            expect(result.matrix[1][8]).toBe(1);
        });

        it('should have zeros on diagonal', () => {
            const result = calculateCoOccurrence();

            for (let i = 1; i <= result.maxNum; i++) {
                expect(result.matrix[i][i]).toBe(0);
            }
        });

        it('should return correct maxNum', () => {
            const result = calculateCoOccurrence();

            expect(result.maxNum).toBe(49); // Lotto main range
        });

        it('should return total draws count', () => {
            const result = calculateCoOccurrence();

            expect(result.totalDraws).toBe(3);
        });
    });
});
