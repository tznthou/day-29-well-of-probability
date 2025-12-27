/**
 * Data Controller
 * 負責 CSV 解析與統計指標計算
 */

import { state } from './state.js';

// ============================================================
// 業務常量
// ============================================================

/** 彩券號碼範圍 */
export const LOTTERY_RANGES = {
    lotto: { main: 49, special: 49 },   // 大樂透: 1-49
    super: { main: 38, special: 8 }     // 威力彩: 第一區 1-38, 第二區 1-8
};

/** 每期開出的主號數量 */
export const MAIN_NUMBERS_PER_DRAW = 6;

/** Z-Score 閾值（用於分類天選之子/被遺忘者） */
export const Z_SCORE_THRESHOLD = 2;

/** CSV Injection 危險字元前綴 */
const CSV_INJECTION_PREFIXES = ['=', '+', '-', '@'];

/**
 * Parse CSV text to array of objects
 * 包含輸入驗證、欄位數量檢查、CSV Injection 防護
 * @param {string} text - CSV 文本內容
 * @param {string} [sourcePath] - 來源路徑（用於錯誤訊息）
 * @returns {Array<Object>} 解析後的資料陣列
 * @throws {Error} CSV 格式無效時拋出錯誤
 */
function parseCSV(text, sourcePath = 'unknown') {
    // 輸入驗證
    if (!text || typeof text !== 'string') {
        throw new Error(`Invalid CSV input from ${sourcePath}: text must be a non-empty string`);
    }

    const lines = text.trim().split('\n');

    // 最少需要 header + 1 筆資料
    if (lines.length < 2) {
        throw new Error(`Invalid CSV from ${sourcePath}: must contain header and at least one data row`);
    }

    // 解析 headers（移除 BOM，過濾空白）
    const headers = lines[0]
        .split(',')
        .map(h => h.trim().replace(/^\uFEFF/, ''))
        .filter(h => h.length > 0);

    if (headers.length === 0) {
        throw new Error(`Invalid CSV from ${sourcePath}: empty headers`);
    }

    const expectedColumnCount = headers.length;
    const parsedData = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();

        // 跳過空行
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());

        // 驗證欄位數量
        if (values.length !== expectedColumnCount) {
            console.warn(
                `CSV ${sourcePath} line ${i + 1}: column count mismatch ` +
                `(expected ${expectedColumnCount}, got ${values.length}), skipping row`
            );
            continue;
        }

        const obj = {};
        headers.forEach((header, idx) => {
            let value = values[idx] || '';

            // CSV Injection 防護：過濾危險前綴
            if (value.length > 0 && CSV_INJECTION_PREFIXES.includes(value[0])) {
                console.warn(
                    `CSV ${sourcePath} line ${i + 1}: potential CSV injection in "${header}", sanitizing`
                );
                value = "'" + value; // 加上單引號強制為文字
            }

            obj[header] = value;
        });

        parsedData.push(obj);
    }

    return parsedData;
}

/**
 * Load all CSV files
 * @returns {Promise<Object>} 載入的資料物件
 * @throws {Error} 載入失敗時拋出錯誤
 */
export async function loadAllData() {
    const files = {
        lotto: {
            2024: 'data/lotto_2024.csv',
            2025: 'data/lotto_2025.csv'
        },
        super: {
            2024: 'data/super_2024.csv',
            2025: 'data/super_2025.csv'
        }
    };

    /**
     * 載入單一 CSV 檔案（含錯誤處理）
     * @param {string} path - 檔案路徑
     * @returns {Promise<Array<Object>>} 解析後的資料
     */
    const loadFile = async (path) => {
        try {
            const response = await fetch(path);

            // 檢查 HTTP 狀態
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const text = await response.text();
            return parseCSV(text, path);
        } catch (error) {
            console.error(`Failed to load ${path}:`, error);
            throw new Error(`無法載入 ${path}: ${error.message}`);
        }
    };

    // Load all files in parallel
    try {
        const [lotto2024, lotto2025, super2024, super2025] = await Promise.all([
            loadFile(files.lotto[2024]),
            loadFile(files.lotto[2025]),
            loadFile(files.super[2024]),
            loadFile(files.super[2025])
        ]);

        state.data = {
            lotto: { 2024: lotto2024, 2025: lotto2025 },
            super: { 2024: super2024, 2025: super2025 }
        };

        return state.data;
    } catch (error) {
        console.error('Failed to load CSV data:', error);
        throw new Error('數據載入失敗，請檢查 CSV 檔案是否存在且格式正確');
    }
}

/**
 * Get current dataset based on state
 */
export function getCurrentData() {
    const { lotteryType, year } = state;
    const typeData = state.data[lotteryType];

    if (year === 'all') {
        return [...(typeData[2024] || []), ...(typeData[2025] || [])];
    }
    return typeData[year] || [];
}

/**
 * Get number range for current lottery type
 */
export function getNumberRange() {
    return LOTTERY_RANGES[state.lotteryType];
}

/**
 * Calculate all statistics
 */
export function calculateStats() {
    const data = getCurrentData();
    const range = getNumberRange();
    const isLotto = state.lotteryType === 'lotto';

    // Initialize frequency maps
    const frequency = {};
    const specialFrequency = {};

    for (let i = 1; i <= range.main; i++) {
        frequency[i] = 0;
    }
    for (let i = 1; i <= range.special; i++) {
        specialFrequency[i] = 0;
    }

    // Count frequencies
    data.forEach(row => {
        // Main numbers (獎號1-6)
        for (let i = 1; i <= MAIN_NUMBERS_PER_DRAW; i++) {
            const num = parseInt(row[`獎號${i}`], 10);
            if (num && frequency[num] !== undefined) {
                frequency[num]++;
            }
        }

        // Special number
        if (isLotto) {
            const special = parseInt(row['特別號'], 10);
            if (special && specialFrequency[special] !== undefined) {
                specialFrequency[special]++;
            }
        } else {
            const second = parseInt(row['第二區'], 10);
            if (second && specialFrequency[second] !== undefined) {
                specialFrequency[second]++;
            }
        }
    });

    // Calculate mean and standard deviation for main numbers
    const counts = Object.values(frequency);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    // Calculate Z-scores
    const zScores = {};
    for (const [num, count] of Object.entries(frequency)) {
        zScores[num] = stdDev > 0 ? (count - mean) / stdDev : 0;
    }

    // Calculate gaps (periods since last appearance)
    const gaps = calculateGaps(data, range.main);

    // Update state
    state.stats = {
        frequency,
        specialFrequency,
        zScores,
        gaps,
        mean,
        stdDev,
        totalDraws: data.length
    };

    return state.stats;
}

/**
 * Calculate gap periods for each number
 */
function calculateGaps(data, maxNum) {
    const gaps = {};
    const lastSeen = {};

    // Initialize
    for (let i = 1; i <= maxNum; i++) {
        gaps[i] = 0;
        lastSeen[i] = -1;
    }

    // Process draws in chronological order
    const sortedData = [...data].sort((a, b) => {
        return a['期別'].localeCompare(b['期別']);
    });

    sortedData.forEach((row, drawIndex) => {
        const drawnNumbers = new Set();

        for (let i = 1; i <= MAIN_NUMBERS_PER_DRAW; i++) {
            const num = parseInt(row[`獎號${i}`], 10);
            if (num) drawnNumbers.add(num);
        }

        // Update last seen
        drawnNumbers.forEach(num => {
            if (lastSeen[num] !== undefined) {
                lastSeen[num] = drawIndex;
            }
        });
    });

    // Calculate gaps from last draw
    const totalDraws = sortedData.length;
    for (let i = 1; i <= maxNum; i++) {
        if (lastSeen[i] === -1) {
            gaps[i] = totalDraws; // Never appeared
        } else {
            gaps[i] = totalDraws - 1 - lastSeen[i];
        }
    }

    return gaps;
}

/**
 * Get status label based on Z-score
 */
export function getStatus(zScore) {
    if (zScore > Z_SCORE_THRESHOLD) return { label: '天選之子', class: 'favorites' };
    if (zScore < -Z_SCORE_THRESHOLD) return { label: '被遺忘者', class: 'outcasts' };
    return { label: '常態', class: 'normal' };
}

/**
 * Get comparison data for year-over-year chart
 */
export function getComparisonData() {
    const { lotteryType } = state;
    const data2024 = state.data[lotteryType][2024] || [];
    const data2025 = state.data[lotteryType][2025] || [];
    const range = getNumberRange();

    const freq2024 = {};
    const freq2025 = {};

    for (let i = 1; i <= range.main; i++) {
        freq2024[i] = 0;
        freq2025[i] = 0;
    }

    // Count 2024
    data2024.forEach(row => {
        for (let i = 1; i <= MAIN_NUMBERS_PER_DRAW; i++) {
            const num = parseInt(row[`獎號${i}`], 10);
            if (num && freq2024[num] !== undefined) {
                freq2024[num]++;
            }
        }
    });

    // Count 2025
    data2025.forEach(row => {
        for (let i = 1; i <= MAIN_NUMBERS_PER_DRAW; i++) {
            const num = parseInt(row[`獎號${i}`], 10);
            if (num && freq2025[num] !== undefined) {
                freq2025[num]++;
            }
        }
    });

    return { freq2024, freq2025, draws2024: data2024.length, draws2025: data2025.length };
}

/**
 * Calculate co-occurrence matrix (共現矩陣)
 * 計算哪些號碼經常一起出現
 */
export function calculateCoOccurrence() {
    const data = getCurrentData();
    const range = getNumberRange();
    const maxNum = range.main;

    // Initialize matrix (使用物件存儲，節省記憶體)
    const matrix = [];
    for (let i = 0; i <= maxNum; i++) {
        matrix[i] = new Array(maxNum + 1).fill(0);
    }

    // Count co-occurrences
    data.forEach(row => {
        const numbers = [];
        for (let i = 1; i <= MAIN_NUMBERS_PER_DRAW; i++) {
            const num = parseInt(row[`獎號${i}`], 10);
            if (num && num >= 1 && num <= maxNum) {
                numbers.push(num);
            }
        }

        // Count pairs (C(6,2) = 15 pairs per draw)
        for (let i = 0; i < numbers.length; i++) {
            for (let j = i + 1; j < numbers.length; j++) {
                const a = numbers[i];
                const b = numbers[j];
                matrix[a][b]++;
                matrix[b][a]++; // 對稱矩陣
            }
        }
    });

    // 對角線設為 0（自己不跟自己共現）
    for (let i = 1; i <= maxNum; i++) {
        matrix[i][i] = 0;
    }

    return {
        matrix,
        maxNum,
        totalDraws: data.length
    };
}
